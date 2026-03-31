import { RedisAdapter } from "../adapters/redis.adapter.js";
import { buildOtpDeliveryPayload, buildTokenDeliveryPayload } from "../utils/link-builder.js";
import { generateNumericOtp } from "./otp.generator.js";
import { generateSecureToken } from "./token.generator.js";
import { buildVerificationHashes, createStoredOtpHash, verifyOtpHash } from "./otp.hash.js";
import type {
  GenerateOTPInput,
  GenerateOTPResult,
  GenerateTokenInput,
  GenerateTokenResult,
  OTPAuditEvent,
  OTPCooldownBlockedEvent,
  OTPCooldownConfig,
  OTPDeliveryRequest,
  OTPEventContext,
  OTPFailedEvent,
  OTPCredentialKind,
  OTPGeneratedEvent,
  OTPHookErrorContext,
  OTPLockedEvent,
  OTPLockoutConfig,
  OTPManagerOptions,
  OTPRateLimitedEvent,
  OTPReplayProtectionConfig,
  OTPThrottleScope,
  OTPTokenLinkOptions,
  OTPVerifiedEvent,
  RateLimitConfig,
  VerifyOTPInput,
  VerifyTokenInput,
} from "./otp.types.js";
import {
  OTPExpiredError,
  OTPInvalidError,
  VerificationSecretAlreadyUsedError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "../errors/otp.errors.js";
import {
  buildAttemptsKey,
  buildCooldownKey,
  buildLockKey,
  buildOtpKey,
  buildRateLimitKey,
  buildTokenAttemptsKey,
  buildTokenCooldownKey,
  buildTokenKey,
  buildTokenLockKey,
  buildTokenRateLimitKey,
  buildTokenUsedKey,
} from "../utils/key-builder.js";
import { normalizePayloadIdentifier } from "../utils/identifier-normalizer.js";
import { assertWithinRateLimit } from "../utils/rate-limiter.js";

interface SecretKeySet {
  secretKey: string;
  attemptsKey: string;
  rateLimitKey: string;
  cooldownKey: string;
  lockKey: string;
  usedKey: string;
}

interface GeneratedSecretFlowResult<TResult extends GenerateOTPResult | GenerateTokenResult> {
  result: TResult;
  secret: string;
  normalizedInput: GenerateOTPInput | GenerateTokenInput;
}

type SecretKind = "otp" | "token";

export class OTPManager {
  private readonly options: Required<Pick<OTPManagerOptions, "ttl" | "maxAttempts">> &
    Omit<OTPManagerOptions, "ttl" | "maxAttempts">;

  constructor(options: OTPManagerOptions) {
    validateManagerOptions(options);

    this.options = {
      ...options,
      otpLength: options.otpLength ?? 6,
      devMode: options.devMode ?? false,
    };

    const resolvedRateLimit = this.getResolvedRateLimit();

    if (resolvedRateLimit?.algorithm === "sliding_window" && !(options.store instanceof RedisAdapter)) {
      throw new TypeError("Sliding-window rate limiting currently requires RedisAdapter.");
    }
  }

  async generate(input: GenerateOTPInput): Promise<GenerateOTPResult> {
    return (await this.generateSecretFlow("otp", input, () => generateNumericOtp(this.options.otpLength), "otp")).result;
  }

  async generateAndSend(input: GenerateOTPInput): Promise<GenerateOTPResult> {
    const flow = await this.generateSecretFlow(
      "otp",
      input,
      () => generateNumericOtp(this.options.otpLength),
      "otp",
    );

    await this.sendDelivery(
      buildOtpDeliveryPayload({
        type: flow.normalizedInput.type,
        identifier: flow.normalizedInput.identifier,
        intent: flow.normalizedInput.intent,
        otp: flow.secret,
        expiresIn: flow.result.expiresIn,
        metadata: flow.normalizedInput.metadata,
      }),
    );

    return flow.result;
  }

  async verify(input: VerifyOTPInput): Promise<true> {
    return this.verifySecretFlow("otp", input, input.otp);
  }

  async generateToken(input: GenerateTokenInput): Promise<GenerateTokenResult> {
    return (await this.generateSecretFlow("token", input, () => generateSecureToken(), "token")).result;
  }

  async generateTokenAndSend(
    input: GenerateTokenInput,
    linkOptions?: OTPTokenLinkOptions,
  ): Promise<GenerateTokenResult> {
    const flow = await this.generateSecretFlow("token", input, () => generateSecureToken(), "token");

    const deliveryPayload: OTPDeliveryRequest = linkOptions
      ? buildTokenDeliveryPayload({
          ...linkOptions,
          token: flow.secret,
          identifier: flow.normalizedInput.identifier,
          intent: flow.normalizedInput.intent,
          type: flow.normalizedInput.type,
          expiresIn: flow.result.expiresIn,
          metadata: flow.normalizedInput.metadata,
        })
      : {
          credentialKind: "token",
          type: flow.normalizedInput.type,
          identifier: flow.normalizedInput.identifier,
          intent: flow.normalizedInput.intent,
          token: flow.secret,
          expiresIn: flow.result.expiresIn,
          metadata: flow.normalizedInput.metadata,
        };

    await this.sendDelivery(deliveryPayload);

    return flow.result;
  }

  async verifyToken(input: VerifyTokenInput): Promise<true> {
    return this.verifySecretFlow("token", input, input.token);
  }

  private async generateSecretFlow(
    kind: SecretKind,
    input: GenerateOTPInput | GenerateTokenInput,
    generateSecret: () => string,
    resultField: "otp" | "token",
  ): Promise<GeneratedSecretFlowResult<GenerateOTPResult | GenerateTokenResult>> {
    validatePayload(input);
    const normalizedInput = normalizePayloadIdentifier(input, this.options.identifierNormalization);
    const eventContext = this.buildEventContext(kind, input, normalizedInput.identifier);

    const resolvedRateLimit = this.getResolvedRateLimit();
    const resolvedCooldown = this.getResolvedCooldown();
    const resolvedLockout = this.getResolvedLockout();
    const keys = this.buildKeys(
      kind,
      normalizedInput,
      resolvedRateLimit?.scope ?? "channel",
      resolvedCooldown?.scope ?? "intent_channel",
      resolvedLockout?.scope ?? "intent_channel",
    );
    const secret = generateSecret();
    const storedHash = createStoredOtpHash(secret, normalizedInput, this.options.hashing);

    if (this.shouldCheckGenerateLock(resolvedLockout)) {
      const locked = await this.options.store.get(keys.lockKey);

      if (locked) {
        await this.emitLocked(eventContext, "generate", resolvedLockout);
        throw new OTPLockedError();
      }
    }

    if (this.options.store instanceof RedisAdapter) {
      const atomicResult = await this.options.store.generateOtpAtomically({
        otpKey: keys.secretKey,
        attemptsKey: keys.attemptsKey,
        rateLimitKey: keys.rateLimitKey,
        cooldownKey: keys.cooldownKey,
        lockKey: keys.lockKey,
        hashedOtp: storedHash,
        ttl: this.options.ttl,
        rateWindow: resolvedRateLimit?.window,
        rateMax: resolvedRateLimit?.max,
        rateAlgorithm: resolvedRateLimit?.algorithm,
        resendCooldown: resolvedCooldown?.seconds,
        checkLock: this.shouldCheckGenerateLock(resolvedLockout),
      });

      if (atomicResult === "locked") {
        await this.emitLocked(eventContext, "generate", resolvedLockout);
        throw new OTPLockedError();
      }

      if (atomicResult === "cooldown") {
        await this.emitCooldownBlocked(eventContext, resolvedCooldown);
        throw new OTPResendCooldownError();
      }

      if (atomicResult === "rate_limit") {
        await this.emitRateLimited(eventContext, resolvedRateLimit);
        throw new OTPRateLimitExceededError();
      }

      if (atomicResult === "ok") {
        const result: GenerateOTPResult | GenerateTokenResult = {
          expiresIn: this.options.ttl,
          [resultField]: this.options.devMode ? secret : undefined,
        };

        await this.emitGenerated(eventContext);
        return {
          result,
          secret,
          normalizedInput,
        };
      }
    }

    if (resolvedCooldown) {
      const cooldownActive = await this.options.store.get(keys.cooldownKey);

      if (cooldownActive) {
        await this.emitCooldownBlocked(eventContext, resolvedCooldown);
        throw new OTPResendCooldownError();
      }
    }

    try {
      await assertWithinRateLimit(this.options.store, keys.rateLimitKey, resolvedRateLimit);
    } catch (error) {
      if (error instanceof OTPRateLimitExceededError) {
        await this.emitRateLimited(eventContext, resolvedRateLimit);
      }
      throw error;
    }

    await this.options.store.set(keys.secretKey, storedHash, this.options.ttl);
    await this.options.store.del(keys.attemptsKey);

    if (resolvedCooldown) {
      await this.options.store.set(keys.cooldownKey, "1", resolvedCooldown.seconds);
    }

    const result: GenerateOTPResult | GenerateTokenResult = {
      expiresIn: this.options.ttl,
      [resultField]: this.options.devMode ? secret : undefined,
    };

    await this.emitGenerated(eventContext);
    return {
      result,
      secret,
      normalizedInput,
    };
  }

  private async verifySecretFlow(
    kind: SecretKind,
    input: VerifyOTPInput | VerifyTokenInput,
    providedSecret: string,
  ): Promise<true> {
    const expiredError = kind === "otp" ? new OTPExpiredError() : new VerificationSecretExpiredError();
    const invalidError = kind === "otp" ? new OTPInvalidError() : new VerificationSecretInvalidError();
    const alreadyUsedError = new VerificationSecretAlreadyUsedError();
    validatePayload(input);
    const normalizedInput = normalizePayloadIdentifier(input, this.options.identifierNormalization);
    const eventContext = this.buildEventContext(kind, input, normalizedInput.identifier);
    const resolvedLockout = this.getResolvedLockout();
    const resolvedReplayProtection = kind === "token" ? this.getResolvedReplayProtection() : undefined;

    if (!providedSecret || !providedSecret.trim()) {
      throw new TypeError(`${kind === "otp" ? "OTP" : "token"} must be a non-empty string.`);
    }

    const keys = this.buildKeys(kind, normalizedInput, "channel", "intent_channel", resolvedLockout?.scope ?? "intent_channel");
    const candidateHashes = buildVerificationHashes(providedSecret, normalizedInput, this.options.hashing);

    if (this.shouldCheckVerifyLock(resolvedLockout)) {
      const locked = await this.options.store.get(keys.lockKey);

      if (locked) {
        await this.emitLocked(eventContext, "verify", resolvedLockout);
        throw new OTPLockedError();
      }
    }

    if (this.options.store instanceof RedisAdapter) {
      const atomicResult = await this.options.store.verifyOtpAtomically({
        otpKey: keys.secretKey,
        attemptsKey: keys.attemptsKey,
        lockKey: keys.lockKey,
        usedKey: resolvedReplayProtection ? keys.usedKey : undefined,
        candidateHashes,
        ttl: this.options.ttl,
        maxAttempts: this.options.maxAttempts,
        checkLock: this.shouldCheckVerifyLock(resolvedLockout),
        lockoutAfter: resolvedLockout?.afterAttempts,
        lockoutSeconds: resolvedLockout?.seconds,
        replayProtectionTtl: resolvedReplayProtection?.ttl,
      });

      if (atomicResult === "verified") {
        await this.emitVerified(eventContext);
        return true;
      }

      if (atomicResult === "already_used") {
        await this.emitFailed(eventContext, "already_used");
        throw alreadyUsedError;
      }

      if (atomicResult === "expired") {
        await this.emitFailed(eventContext, "expired");
        throw expiredError;
      }

      if (atomicResult === "locked") {
        await this.emitLocked(eventContext, "verify", resolvedLockout);
        throw new OTPLockedError();
      }

      if (atomicResult === "max_attempts") {
        await this.emitLocked(eventContext, "verify", resolvedLockout);
        throw new OTPMaxAttemptsExceededError();
      }

      if (atomicResult === "invalid") {
        await this.emitFailed(eventContext, "invalid");
        throw invalidError;
      }
    }

    if (resolvedReplayProtection) {
      const usedMarker = await this.options.store.get(keys.usedKey);

      if (usedMarker) {
        await this.emitFailed(eventContext, "already_used");
        throw alreadyUsedError;
      }
    }

    const storedHash = await this.options.store.get(keys.secretKey);

    if (!storedHash) {
      await this.emitFailed(eventContext, "expired");
      throw expiredError;
    }

    const isValid = verifyOtpHash(providedSecret, normalizedInput, storedHash, this.options.hashing);

    if (!isValid) {
      const attempts = await this.options.store.increment(keys.attemptsKey, this.options.ttl);

      if (resolvedLockout && attempts >= resolvedLockout.afterAttempts) {
        await this.options.store.set(keys.lockKey, "1", resolvedLockout.seconds);
        await this.options.store.del(keys.secretKey);
        await this.options.store.del(keys.attemptsKey);
        await this.emitLocked(eventContext, "verify", resolvedLockout);
        throw new OTPLockedError();
      }

      if (attempts >= this.options.maxAttempts) {
        await this.options.store.del(keys.secretKey);
        await this.options.store.del(keys.attemptsKey);
        await this.emitLocked(eventContext, "verify", resolvedLockout);
        throw new OTPMaxAttemptsExceededError();
      }

      await this.emitFailed(eventContext, "invalid", attempts);
      throw invalidError;
    }

    if (resolvedReplayProtection) {
      await this.options.store.set(keys.usedKey, "1", resolvedReplayProtection.ttl);
    }

    await this.options.store.del(keys.secretKey);
    await this.options.store.del(keys.attemptsKey);
    await this.emitVerified(eventContext);

    return true;
  }

  private buildKeys(
    kind: SecretKind,
    payload: GenerateOTPInput | GenerateTokenInput | VerifyOTPInput | VerifyTokenInput,
    rateScope: OTPThrottleScope,
    cooldownScope: OTPThrottleScope,
    lockScope: OTPThrottleScope,
  ): SecretKeySet {
    if (kind === "token") {
      return {
        secretKey: buildTokenKey(payload),
        attemptsKey: buildTokenAttemptsKey(payload),
        rateLimitKey: buildTokenRateLimitKey(payload, rateScope),
        cooldownKey: buildTokenCooldownKey(payload, cooldownScope),
        lockKey: buildTokenLockKey(payload, lockScope),
        usedKey: buildTokenUsedKey(payload, lockScope),
      };
    }

    return {
      secretKey: buildOtpKey(payload),
      attemptsKey: buildAttemptsKey(payload),
      rateLimitKey: buildRateLimitKey(payload, rateScope),
      cooldownKey: buildCooldownKey(payload, cooldownScope),
      lockKey: buildLockKey(payload, lockScope),
      usedKey: buildLockKey(payload, lockScope),
    };
  }

  private getResolvedCooldown(): OTPCooldownConfig | undefined {
    if (this.options.cooldown) {
      return {
        seconds: this.options.cooldown.seconds,
        scope: this.options.cooldown.scope ?? "intent_channel",
      };
    }

    if (this.options.resendCooldown) {
      return {
        seconds: this.options.resendCooldown,
        scope: "intent_channel",
      };
    }

    return undefined;
  }

  private getResolvedRateLimit(): RateLimitConfig | undefined {
    if (!this.options.rateLimit) {
      return undefined;
    }

    return {
      ...this.options.rateLimit,
      scope: this.options.rateLimit.scope ?? "channel",
      algorithm: this.options.rateLimit.algorithm ?? "fixed_window",
    };
  }

  private getResolvedReplayProtection(): OTPReplayProtectionConfig | undefined {
    if (!this.options.replayProtection?.enabled) {
      return undefined;
    }

    return {
      enabled: true,
      ttl: this.options.replayProtection.ttl,
      scope: this.options.replayProtection.scope ?? "intent_channel",
    };
  }

  private getResolvedLockout(): OTPLockoutConfig | undefined {
    if (!this.options.lockout) {
      return undefined;
    }

    return {
      ...this.options.lockout,
      appliesTo: this.options.lockout.appliesTo ?? "both",
      scope: this.options.lockout.scope ?? "intent_channel",
    };
  }

  private shouldCheckGenerateLock(lockout?: OTPLockoutConfig): boolean {
    return lockout?.appliesTo === "generate" || lockout?.appliesTo === "both";
  }

  private shouldCheckVerifyLock(lockout?: OTPLockoutConfig): boolean {
    return lockout?.appliesTo === "verify" || lockout?.appliesTo === "both";
  }

  private buildEventContext(
    credentialKind: OTPCredentialKind,
    input: GenerateOTPInput | VerifyOTPInput | GenerateTokenInput | VerifyTokenInput,
    normalizedIdentifier: string,
  ): OTPEventContext {
    return {
      credentialKind,
      type: input.type,
      identifier: input.identifier,
      normalizedIdentifier,
      intent: input.intent ?? "default",
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    };
  }

  private async sendDelivery(payload: OTPDeliveryRequest): Promise<void> {
    if (!this.options.deliveryAdapter) {
      throw new TypeError("deliveryAdapter is required for send helpers.");
    }

    await this.options.deliveryAdapter.send(payload);
  }

  private async emitGenerated(context: OTPEventContext): Promise<void> {
    await this.dispatchLifecycleEvent("generated", {
      ...context,
      expiresIn: this.options.ttl,
      devMode: this.options.devMode,
    });
  }

  private async emitVerified(context: OTPEventContext): Promise<void> {
    await this.dispatchLifecycleEvent("verified", context);
  }

  private async emitFailed(
    context: OTPEventContext,
    reason: OTPFailedEvent["reason"],
    attemptsUsed?: number,
  ): Promise<void> {
    await this.dispatchLifecycleEvent("failed", {
      ...context,
      reason,
      attemptsUsed,
      attemptsRemaining:
        attemptsUsed !== undefined ? Math.max(this.options.maxAttempts - attemptsUsed, 0) : undefined,
    });
  }

  private async emitLocked(
    context: OTPEventContext,
    operation: OTPLockedEvent["operation"],
    lockout?: OTPLockoutConfig,
  ): Promise<void> {
    await this.dispatchLifecycleEvent("locked", {
      ...context,
      maxAttempts: this.options.maxAttempts,
      operation,
      lockoutSeconds: lockout?.seconds,
      appliesTo: lockout?.appliesTo,
      scope: lockout?.scope,
    });
  }

  private async emitRateLimited(
    context: OTPEventContext,
    rateLimit?: RateLimitConfig,
  ): Promise<void> {
    if (!rateLimit) {
      return;
    }

    await this.dispatchLifecycleEvent("rate_limited", {
      ...context,
      window: rateLimit.window,
      max: rateLimit.max,
      scope: rateLimit.scope ?? "channel",
      algorithm: rateLimit.algorithm ?? "fixed_window",
    });
  }

  private async emitCooldownBlocked(
    context: OTPEventContext,
    cooldown?: OTPCooldownConfig,
  ): Promise<void> {
    if (!cooldown) {
      return;
    }

    await this.dispatchLifecycleEvent("cooldown_blocked", {
      ...context,
      resendCooldown: cooldown.seconds,
      scope: cooldown.scope ?? "intent_channel",
    });
  }

  private async dispatchLifecycleEvent(
    eventName: OTPHookErrorContext["event"],
    payload:
      | OTPGeneratedEvent
      | OTPVerifiedEvent
      | OTPFailedEvent
      | OTPLockedEvent
      | OTPRateLimitedEvent
      | OTPCooldownBlockedEvent,
  ): Promise<void> {
    const hook = this.getHook(eventName);
    const auditEvent: OTPAuditEvent = {
      event: eventName,
      payload,
    };

    if (!hook && !this.options.auditAdapter) {
      return;
    }

    const runWithHandling = async (fn: () => Promise<void> | void): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        if (this.options.hooks?.onHookError) {
          await this.options.hooks.onHookError(error, {
            event: eventName,
            payload,
          });
        }

        if (this.options.hooks?.throwOnError) {
          throw error;
        }
      }
    };

    const execute = async (): Promise<void> => {
      if (hook) {
        await runWithHandling(() => hook(payload as never));
      }

      if (this.options.auditAdapter) {
        await runWithHandling(() => this.options.auditAdapter!.record(auditEvent));
      }
    };

    if (this.options.hooks?.throwOnError) {
      await execute();
      return;
    }

    queueMicrotask(() => {
      void execute();
    });
  }

  private getHook(eventName: OTPHookErrorContext["event"]) {
    switch (eventName) {
      case "generated":
        return this.options.hooks?.onGenerated;
      case "verified":
        return this.options.hooks?.onVerified;
      case "failed":
        return this.options.hooks?.onFailed;
      case "locked":
        return this.options.hooks?.onLocked;
      case "rate_limited":
        return this.options.hooks?.onRateLimited;
      case "cooldown_blocked":
        return this.options.hooks?.onCooldownBlocked;
      default:
        return undefined;
    }
  }
}

function validateManagerOptions(options: OTPManagerOptions): void {
  if (!options.store || typeof options.store !== "object") {
    throw new TypeError("store must be a valid adapter object.");
  }

  const storeMethods = ["get", "set", "del", "increment"] as const;
  for (const method of storeMethods) {
    if (typeof options.store[method] !== "function") {
      throw new TypeError(`store.${method} must be a function.`);
    }
  }

  if (!Number.isInteger(options.ttl) || options.ttl <= 0) {
    throw new TypeError("ttl must be a positive integer.");
  }

  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts <= 0) {
    throw new TypeError("maxAttempts must be a positive integer.");
  }

  if (
    options.otpLength !== undefined &&
    (!Number.isInteger(options.otpLength) || options.otpLength <= 0)
  ) {
    throw new TypeError("otpLength must be a positive integer when provided.");
  }

  if (
    options.resendCooldown !== undefined &&
    (!Number.isInteger(options.resendCooldown) || options.resendCooldown <= 0)
  ) {
    throw new TypeError("resendCooldown must be a positive integer when provided.");
  }

  if (options.cooldown) {
    if (!Number.isInteger(options.cooldown.seconds) || options.cooldown.seconds <= 0) {
      throw new TypeError("cooldown.seconds must be a positive integer.");
    }

    if (options.cooldown.scope && !isValidScope(options.cooldown.scope)) {
      throw new TypeError("cooldown.scope must be a supported throttle scope.");
    }
  }

  if (options.rateLimit) {
    if (!Number.isInteger(options.rateLimit.window) || options.rateLimit.window <= 0) {
      throw new TypeError("rateLimit.window must be a positive integer.");
    }

    if (!Number.isInteger(options.rateLimit.max) || options.rateLimit.max <= 0) {
      throw new TypeError("rateLimit.max must be a positive integer.");
    }

    if (options.rateLimit.scope && !isValidScope(options.rateLimit.scope)) {
      throw new TypeError("rateLimit.scope must be a supported throttle scope.");
    }

    if (
      options.rateLimit.algorithm &&
      options.rateLimit.algorithm !== "fixed_window" &&
      options.rateLimit.algorithm !== "sliding_window"
    ) {
      throw new TypeError("rateLimit.algorithm must be fixed_window or sliding_window.");
    }
  }

  if (options.lockout) {
    if (!Number.isInteger(options.lockout.seconds) || options.lockout.seconds <= 0) {
      throw new TypeError("lockout.seconds must be a positive integer.");
    }

    if (!Number.isInteger(options.lockout.afterAttempts) || options.lockout.afterAttempts <= 0) {
      throw new TypeError("lockout.afterAttempts must be a positive integer.");
    }

    if (options.lockout.afterAttempts > options.maxAttempts) {
      throw new TypeError("lockout.afterAttempts cannot be greater than maxAttempts.");
    }

    if (options.lockout.scope && !isValidScope(options.lockout.scope)) {
      throw new TypeError("lockout.scope must be a supported throttle scope.");
    }

    if (
      options.lockout.appliesTo &&
      !["verify", "generate", "both"].includes(options.lockout.appliesTo)
    ) {
      throw new TypeError("lockout.appliesTo must be verify, generate, or both.");
    }
  }

  if (options.identifierNormalization) {
    const { trim, lowercase, preserveCaseFor } = options.identifierNormalization;

    if (trim !== undefined && typeof trim !== "boolean") {
      throw new TypeError("identifierNormalization.trim must be a boolean.");
    }

    if (lowercase !== undefined && typeof lowercase !== "boolean") {
      throw new TypeError("identifierNormalization.lowercase must be a boolean.");
    }

    if (
      preserveCaseFor !== undefined &&
      (!Array.isArray(preserveCaseFor) ||
        preserveCaseFor.some((channel) => typeof channel !== "string" || !channel.trim()))
    ) {
      throw new TypeError(
        "identifierNormalization.preserveCaseFor must be an array of non-empty strings.",
      );
    }
  }

  if (options.replayProtection) {
    if (typeof options.replayProtection.enabled !== "boolean") {
      throw new TypeError("replayProtection.enabled must be a boolean.");
    }

    if (!Number.isInteger(options.replayProtection.ttl) || options.replayProtection.ttl <= 0) {
      throw new TypeError("replayProtection.ttl must be a positive integer.");
    }

    if (options.replayProtection.scope && !isValidScope(options.replayProtection.scope)) {
      throw new TypeError("replayProtection.scope must be a supported throttle scope.");
    }
  }

  if (options.hashing) {
    if (options.hashing.secret !== undefined && !options.hashing.secret.trim()) {
      throw new TypeError("hashing.secret must be a non-empty string when provided.");
    }

    if (
      options.hashing.previousSecrets !== undefined &&
      (!Array.isArray(options.hashing.previousSecrets) ||
        options.hashing.previousSecrets.some((secret) => !secret || !secret.trim()))
    ) {
      throw new TypeError("hashing.previousSecrets must contain only non-empty strings.");
    }

    if (
      options.hashing.secret &&
      options.hashing.previousSecrets?.includes(options.hashing.secret)
    ) {
      throw new TypeError("hashing.previousSecrets must not include hashing.secret.");
    }

    if (
      options.hashing.allowLegacyVerify !== undefined &&
      typeof options.hashing.allowLegacyVerify !== "boolean"
    ) {
      throw new TypeError("hashing.allowLegacyVerify must be a boolean.");
    }
  }

  if (options.hooks) {
    const hookEntries = [
      options.hooks.onGenerated,
      options.hooks.onVerified,
      options.hooks.onFailed,
      options.hooks.onLocked,
      options.hooks.onRateLimited,
      options.hooks.onCooldownBlocked,
      options.hooks.onHookError,
    ];

    if (hookEntries.some((hook) => hook !== undefined && typeof hook !== "function")) {
      throw new TypeError("All hooks must be functions when provided.");
    }

    if (
      options.hooks.throwOnError !== undefined &&
      typeof options.hooks.throwOnError !== "boolean"
    ) {
      throw new TypeError("hooks.throwOnError must be a boolean.");
    }
  }

  if (options.auditAdapter && typeof options.auditAdapter.record !== "function") {
    throw new TypeError("auditAdapter.record must be a function.");
  }

  if (options.deliveryAdapter && typeof options.deliveryAdapter.send !== "function") {
    throw new TypeError("deliveryAdapter.send must be a function.");
  }
}

function validatePayload(
  input: GenerateOTPInput | VerifyOTPInput | GenerateTokenInput | VerifyTokenInput,
): void {
  if (!input.type || !input.type.trim()) {
    throw new TypeError("type must be a non-empty string.");
  }

  if (!input.identifier || !input.identifier.trim()) {
    throw new TypeError("identifier must be a non-empty string.");
  }
}

function isValidScope(scope: string): scope is OTPThrottleScope {
  return ["identifier", "intent", "channel", "intent_channel"].includes(scope);
}

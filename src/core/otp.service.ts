import { RedisAdapter } from "../adapters/redis.adapter.js";
import { generateNumericOtp } from "./otp.generator.js";
import { buildVerificationHashes, createStoredOtpHash, verifyOtpHash } from "./otp.hash.js";
import type {
  GenerateOTPInput,
  GenerateOTPResult,
  OTPCooldownBlockedEvent,
  OTPEventContext,
  OTPFailedEvent,
  OTPGeneratedEvent,
  OTPHookErrorContext,
  OTPLockedEvent,
  OTPManagerOptions,
  OTPRateLimitedEvent,
  OTPVerifiedEvent,
  VerifyOTPInput,
} from "./otp.types.js";
import {
  OTPExpiredError,
  OTPInvalidError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "../errors/otp.errors.js";
import {
  buildAttemptsKey,
  buildCooldownKey,
  buildOtpKey,
  buildRateLimitKey,
} from "../utils/key-builder.js";
import { normalizePayloadIdentifier } from "../utils/identifier-normalizer.js";
import { assertWithinRateLimit } from "../utils/rate-limiter.js";

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
  }

  async generate(input: GenerateOTPInput): Promise<GenerateOTPResult> {
    validatePayload(input);
    const normalizedInput = normalizePayloadIdentifier(
      input,
      this.options.identifierNormalization,
    );
    const eventContext = this.buildEventContext(input, normalizedInput.identifier);

    const otpKey = buildOtpKey(normalizedInput);
    const attemptsKey = buildAttemptsKey(normalizedInput);
    const rateLimitKey = buildRateLimitKey(normalizedInput);
    const cooldownKey = buildCooldownKey(normalizedInput);
    const otp = generateNumericOtp(this.options.otpLength);
    const storedHash = createStoredOtpHash(otp, normalizedInput, this.options.hashing);

    if (this.options.store instanceof RedisAdapter) {
      const atomicResult = await this.options.store.generateOtpAtomically({
        otpKey,
        attemptsKey,
        rateLimitKey,
        cooldownKey,
        hashedOtp: storedHash,
        ttl: this.options.ttl,
        rateWindow: this.options.rateLimit?.window,
        rateMax: this.options.rateLimit?.max,
        resendCooldown: this.options.resendCooldown,
      });

      if (atomicResult === "cooldown") {
        await this.emitCooldownBlocked(eventContext);
        throw new OTPResendCooldownError();
      }

      if (atomicResult === "rate_limit") {
        await this.emitRateLimited(eventContext);
        throw new OTPRateLimitExceededError();
      }

      if (atomicResult === "ok") {
        const result = {
          expiresIn: this.options.ttl,
          otp: this.options.devMode ? otp : undefined,
        };

        await this.emitGenerated(eventContext);
        return result;
      }
    }

    if (this.options.resendCooldown) {
      const cooldownActive = await this.options.store.get(cooldownKey);

      if (cooldownActive) {
        await this.emitCooldownBlocked(eventContext);
        throw new OTPResendCooldownError();
      }
    }

    try {
      await assertWithinRateLimit(this.options.store, rateLimitKey, this.options.rateLimit);
    } catch (error) {
      if (error instanceof OTPRateLimitExceededError) {
        await this.emitRateLimited(eventContext);
      }
      throw error;
    }

    await this.options.store.set(otpKey, storedHash, this.options.ttl);
    await this.options.store.del(attemptsKey);

    if (this.options.resendCooldown) {
      await this.options.store.set(cooldownKey, "1", this.options.resendCooldown);
    }

    const result = {
      expiresIn: this.options.ttl,
      otp: this.options.devMode ? otp : undefined,
    };

    await this.emitGenerated(eventContext);
    return result;
  }

  async verify(input: VerifyOTPInput): Promise<true> {
    validatePayload(input);
    const normalizedInput = normalizePayloadIdentifier(
      input,
      this.options.identifierNormalization,
    );
    const eventContext = this.buildEventContext(input, normalizedInput.identifier);

    if (!input.otp || !input.otp.trim()) {
      throw new TypeError("OTP must be a non-empty string.");
    }

    const otpKey = buildOtpKey(normalizedInput);
    const attemptsKey = buildAttemptsKey(normalizedInput);
    const candidateHashes = buildVerificationHashes(
      input.otp,
      normalizedInput,
      this.options.hashing,
    );

    if (this.options.store instanceof RedisAdapter) {
      const atomicResult = await this.options.store.verifyOtpAtomically({
        otpKey,
        attemptsKey,
        candidateHashes,
        ttl: this.options.ttl,
        maxAttempts: this.options.maxAttempts,
      });

      if (atomicResult === "verified") {
        await this.emitVerified(eventContext);
        return true;
      }

      if (atomicResult === "expired") {
        await this.emitFailed(eventContext, "expired");
        throw new OTPExpiredError();
      }

      if (atomicResult === "max_attempts") {
        await this.emitLocked(eventContext);
        throw new OTPMaxAttemptsExceededError();
      }

      if (atomicResult === "invalid") {
        await this.emitFailed(eventContext, "invalid");
        throw new OTPInvalidError();
      }
    }

    const storedHash = await this.options.store.get(otpKey);

    if (!storedHash) {
      await this.emitFailed(eventContext, "expired");
      throw new OTPExpiredError();
    }

    const isValid = verifyOtpHash(input.otp, normalizedInput, storedHash, this.options.hashing);

    if (!isValid) {
      const attempts = await this.options.store.increment(attemptsKey, this.options.ttl);

      if (attempts >= this.options.maxAttempts) {
        await this.options.store.del(otpKey);
        await this.options.store.del(attemptsKey);
        await this.emitLocked(eventContext);
        throw new OTPMaxAttemptsExceededError();
      }

      await this.emitFailed(eventContext, "invalid", attempts);
      throw new OTPInvalidError();
    }

    await this.options.store.del(otpKey);
    await this.options.store.del(attemptsKey);
    await this.emitVerified(eventContext);

    return true;
  }

  private buildEventContext(
    input: GenerateOTPInput | VerifyOTPInput,
    normalizedIdentifier: string,
  ): OTPEventContext {
    return {
      type: input.type,
      identifier: input.identifier,
      normalizedIdentifier,
      intent: input.intent ?? "default",
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    };
  }

  private async emitGenerated(context: OTPEventContext): Promise<void> {
    await this.dispatchHook("generated", {
      ...context,
      expiresIn: this.options.ttl,
      devMode: this.options.devMode,
    });
  }

  private async emitVerified(context: OTPEventContext): Promise<void> {
    await this.dispatchHook("verified", context);
  }

  private async emitFailed(
    context: OTPEventContext,
    reason: OTPFailedEvent["reason"],
    attemptsUsed?: number,
  ): Promise<void> {
    await this.dispatchHook("failed", {
      ...context,
      reason,
      attemptsUsed,
      attemptsRemaining:
        attemptsUsed !== undefined ? Math.max(this.options.maxAttempts - attemptsUsed, 0) : undefined,
    });
  }

  private async emitLocked(context: OTPEventContext): Promise<void> {
    await this.dispatchHook("locked", {
      ...context,
      maxAttempts: this.options.maxAttempts,
    });
  }

  private async emitRateLimited(context: OTPEventContext): Promise<void> {
    if (!this.options.rateLimit) {
      return;
    }

    await this.dispatchHook("rate_limited", {
      ...context,
      window: this.options.rateLimit.window,
      max: this.options.rateLimit.max,
    });
  }

  private async emitCooldownBlocked(context: OTPEventContext): Promise<void> {
    if (!this.options.resendCooldown) {
      return;
    }

    await this.dispatchHook("cooldown_blocked", {
      ...context,
      resendCooldown: this.options.resendCooldown,
    });
  }

  private async dispatchHook(
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

    if (!hook) {
      return;
    }

    const execute = async (): Promise<void> => {
      try {
        await hook(payload as never);
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

  if (options.rateLimit) {
    if (!Number.isInteger(options.rateLimit.window) || options.rateLimit.window <= 0) {
      throw new TypeError("rateLimit.window must be a positive integer.");
    }

    if (!Number.isInteger(options.rateLimit.max) || options.rateLimit.max <= 0) {
      throw new TypeError("rateLimit.max must be a positive integer.");
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
}

function validatePayload(input: GenerateOTPInput | VerifyOTPInput): void {
  if (!input.type || !input.type.trim()) {
    throw new TypeError("type must be a non-empty string.");
  }

  if (!input.identifier || !input.identifier.trim()) {
    throw new TypeError("identifier must be a non-empty string.");
  }
}

import { RedisAdapter } from "../adapters/redis.adapter.js";
import { generateNumericOtp } from "./otp.generator.js";
import { buildVerificationHashes, createStoredOtpHash, verifyOtpHash } from "./otp.hash.js";
import type {
  GenerateOTPInput,
  GenerateOTPResult,
  OTPManagerOptions,
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
        throw new OTPResendCooldownError();
      }

      if (atomicResult === "rate_limit") {
        throw new OTPRateLimitExceededError();
      }

      if (atomicResult === "ok") {
        return {
          expiresIn: this.options.ttl,
          otp: this.options.devMode ? otp : undefined,
        };
      }
    }

    if (this.options.resendCooldown) {
      const cooldownActive = await this.options.store.get(cooldownKey);

      if (cooldownActive) {
        throw new OTPResendCooldownError();
      }
    }

    await assertWithinRateLimit(this.options.store, rateLimitKey, this.options.rateLimit);

    await this.options.store.set(otpKey, storedHash, this.options.ttl);
    await this.options.store.del(attemptsKey);

    if (this.options.resendCooldown) {
      await this.options.store.set(cooldownKey, "1", this.options.resendCooldown);
    }

    return {
      expiresIn: this.options.ttl,
      otp: this.options.devMode ? otp : undefined,
    };
  }

  async verify(input: VerifyOTPInput): Promise<true> {
    validatePayload(input);
    const normalizedInput = normalizePayloadIdentifier(
      input,
      this.options.identifierNormalization,
    );

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
        return true;
      }

      if (atomicResult === "expired") {
        throw new OTPExpiredError();
      }

      if (atomicResult === "max_attempts") {
        throw new OTPMaxAttemptsExceededError();
      }

      if (atomicResult === "invalid") {
        throw new OTPInvalidError();
      }
    }

    const storedHash = await this.options.store.get(otpKey);

    if (!storedHash) {
      throw new OTPExpiredError();
    }

    const isValid = verifyOtpHash(input.otp, normalizedInput, storedHash, this.options.hashing);

    if (!isValid) {
      const attempts = await this.options.store.increment(attemptsKey, this.options.ttl);

      if (attempts >= this.options.maxAttempts) {
        await this.options.store.del(otpKey);
        await this.options.store.del(attemptsKey);
        throw new OTPMaxAttemptsExceededError();
      }

      throw new OTPInvalidError();
    }

    await this.options.store.del(otpKey);
    await this.options.store.del(attemptsKey);

    return true;
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
}

function validatePayload(input: GenerateOTPInput | VerifyOTPInput): void {
  if (!input.type || !input.type.trim()) {
    throw new TypeError("type must be a non-empty string.");
  }

  if (!input.identifier || !input.identifier.trim()) {
    throw new TypeError("identifier must be a non-empty string.");
  }
}

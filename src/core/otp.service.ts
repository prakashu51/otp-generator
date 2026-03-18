import { generateNumericOtp } from "./otp.generator.js";
import { hashOtp, verifyOtpHash } from "./otp.hash.js";
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
} from "../errors/otp.errors.js";
import {
  buildAttemptsKey,
  buildOtpKey,
  buildRateLimitKey,
} from "../utils/key-builder.js";
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

    const otpKey = buildOtpKey(input);
    const attemptsKey = buildAttemptsKey(input);
    const rateLimitKey = buildRateLimitKey(input);

    await assertWithinRateLimit(this.options.store, rateLimitKey, this.options.rateLimit);

    const otp = generateNumericOtp(this.options.otpLength);
    const hashedOtp = hashOtp(otp);

    await this.options.store.set(otpKey, hashedOtp, this.options.ttl);
    await this.options.store.del(attemptsKey);

    return {
      expiresIn: this.options.ttl,
      otp: this.options.devMode ? otp : undefined,
    };
  }

  async verify(input: VerifyOTPInput): Promise<true> {
    validatePayload(input);

    if (!input.otp || !input.otp.trim()) {
      throw new TypeError("OTP must be a non-empty string.");
    }

    const otpKey = buildOtpKey(input);
    const attemptsKey = buildAttemptsKey(input);

    const storedHash = await this.options.store.get(otpKey);

    if (!storedHash) {
      throw new OTPExpiredError();
    }

    const isValid = verifyOtpHash(input.otp, storedHash);

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

  if (options.rateLimit) {
    if (!Number.isInteger(options.rateLimit.window) || options.rateLimit.window <= 0) {
      throw new TypeError("rateLimit.window must be a positive integer.");
    }

    if (!Number.isInteger(options.rateLimit.max) || options.rateLimit.max <= 0) {
      throw new TypeError("rateLimit.max must be a positive integer.");
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

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
    this.options = {
      ...options,
      otpLength: options.otpLength ?? 6,
      devMode: options.devMode ?? false,
    };
  }

  async generate(input: GenerateOTPInput): Promise<GenerateOTPResult> {
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

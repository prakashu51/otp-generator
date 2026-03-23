export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";

export type {
  GenerateOTPInput,
  GenerateOTPResult,
  IdentifierNormalizationConfig,
  OTPHashingOptions,
  OTPManagerOptions,
  OTPPayload,
  RateLimitConfig,
  StoreAdapter,
  VerifyOTPInput,
} from "./core/otp.types.js";

export {
  OTPError,
  OTPExpiredError,
  OTPInvalidError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "./errors/otp.errors.js";

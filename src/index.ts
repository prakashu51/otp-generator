export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";

export type {
  GenerateOTPInput,
  GenerateOTPResult,
  IdentifierNormalizationConfig,
  OTPChannel,
  OTPCooldownBlockedEvent,
  OTPCooldownConfig,
  OTPEventContext,
  OTPFailedEvent,
  OTPGeneratedEvent,
  OTPHashingOptions,
  OTPHookErrorContext,
  OTPHooks,
  OTPLockedEvent,
  OTPLockoutAppliesTo,
  OTPLockoutConfig,
  OTPManagerOptions,
  OTPMetadata,
  OTPPayload,
  OTPRateLimitedEvent,
  OTPRateLimitAlgorithm,
  RateLimitConfig,
  OTPThrottleScope,
  OTPVerifiedEvent,
  StoreAdapter,
  VerifyOTPInput,
} from "./core/otp.types.js";

export {
  OTPError,
  OTPExpiredError,
  OTPInvalidError,
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "./errors/otp.errors.js";

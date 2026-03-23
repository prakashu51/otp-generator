export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";

export type {
  GenerateOTPInput,
  GenerateOTPResult,
  IdentifierNormalizationConfig,
  OTPChannel,
  OTPCooldownBlockedEvent,
  OTPEventContext,
  OTPFailedEvent,
  OTPGeneratedEvent,
  OTPHashingOptions,
  OTPHookErrorContext,
  OTPHooks,
  OTPLockedEvent,
  OTPManagerOptions,
  OTPMetadata,
  OTPPayload,
  OTPRateLimitedEvent,
  OTPVerifiedEvent,
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

export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";
export {
  buildTokenDeliveryPayload,
  buildVerificationLink,
} from "./utils/link-builder.js";

export type {
  BuildTokenDeliveryPayloadOptions,
  BuildVerificationLinkOptions,
  GenerateOTPInput,
  GenerateOTPResult,
  GenerateTokenInput,
  GenerateTokenResult,
  OTPCredentialKind,
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
  OTPThrottleScope,
  OTPVerifiedEvent,
  RateLimitConfig,
  StoreAdapter,
  TokenDeliveryPayload,
  VerificationLinkParamNames,
  VerifyOTPInput,
  VerifyTokenInput,
} from "./core/otp.types.js";

export {
  OTPError,
  OTPExpiredError,
  OTPInvalidError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "./errors/otp.errors.js";

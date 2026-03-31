export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";
export {
  buildOtpDeliveryPayload,
  buildTokenDeliveryPayload,
  buildVerificationLink,
} from "./utils/link-builder.js";

export type {
  BuildOtpDeliveryPayloadOptions,
  BuildTokenDeliveryPayloadOptions,
  BuildVerificationLinkOptions,
  GenerateOTPInput,
  GenerateOTPResult,
  GenerateTokenInput,
  GenerateTokenResult,
  OTPAuditAdapter,
  OTPAuditEvent,
  OTPCredentialKind,
  OTPDeliveryAdapter,
  OTPDeliveryRequest,
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
  OTPReplayProtectionConfig,
  OTPThrottleScope,
  OTPTokenLinkOptions,
  OTPVerifiedEvent,
  RateLimitConfig,
  StoreAdapter,
  VerificationLinkParamNames,
  VerifyOTPInput,
  VerifyTokenInput,
} from "./core/otp.types.js";

export type { OTPAuditAdapter as AuditAdapter } from "./adapters/audit.adapter.js";
export type { OTPDeliveryAdapter as DeliveryAdapter } from "./adapters/delivery.adapter.js";

export {
  OTPError,
  OTPExpiredError,
  OTPInvalidError,
  VerificationSecretAlreadyUsedError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
} from "./errors/otp.errors.js";

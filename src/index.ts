export { OTPManager } from "./core/otp.service.js";
export { RedisAdapter } from "./adapters/redis.adapter.js";
export { MemoryAdapter } from "./adapters/memory.adapter.js";
export {
  buildOtpDeliveryPayload,
  buildTokenDeliveryPayload,
  buildVerificationLink,
} from "./utils/link-builder.js";
export {
  buildVerificationResultLink,
  classifyVerificationError,
  getVerificationOutcome,
} from "./utils/verification-helpers.js";

export type {
  BuildOtpDeliveryPayloadOptions,
  BuildTokenDeliveryPayloadOptions,
  BuildVerificationLinkOptions,
  BuildVerificationResultLinkOptions,
  GenerateOTPInput,
  GenerateOTPResult,
  GenerateTokenInput,
  GenerateTokenResult,
  OTPAuditAdapter,
  OTPAuditEvent,
  OTPClassifiedVerificationError,
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
  OTPVerificationOutcome,
  OTPVerifiedEvent,
  RateLimitConfig,
  StoreAdapter,
  VerificationLinkParamNames,
  VerificationResultParamNames,
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

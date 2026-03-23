export type OTPChannel = "email" | "sms" | "token" | (string & {});
export type OTPMetadata = Record<string, unknown>;
export type OTPThrottleScope = "identifier" | "intent" | "channel" | "intent_channel";
export type OTPRateLimitAlgorithm = "fixed_window" | "sliding_window";
export type OTPLockoutAppliesTo = "verify" | "generate" | "both";

export interface OTPPayload {
  type: OTPChannel;
  identifier: string;
  intent?: string;
  metadata?: OTPMetadata;
}

export interface GenerateOTPInput extends OTPPayload {}

export interface VerifyOTPInput extends OTPPayload {
  otp: string;
}

export interface RateLimitConfig {
  window: number;
  max: number;
  scope?: OTPThrottleScope;
  algorithm?: OTPRateLimitAlgorithm;
}

export interface OTPCooldownConfig {
  seconds: number;
  scope?: OTPThrottleScope;
}

export interface OTPLockoutConfig {
  seconds: number;
  afterAttempts: number;
  appliesTo?: OTPLockoutAppliesTo;
  scope?: OTPThrottleScope;
}

export interface IdentifierNormalizationConfig {
  trim?: boolean;
  lowercase?: boolean;
  preserveCaseFor?: OTPChannel[];
}

export interface OTPHashingOptions {
  secret?: string;
  previousSecrets?: string[];
  allowLegacyVerify?: boolean;
}

export interface OTPEventContext {
  type: OTPChannel;
  identifier: string;
  normalizedIdentifier: string;
  intent: string;
  timestamp: string;
  metadata?: OTPMetadata;
}

export interface OTPGeneratedEvent extends OTPEventContext {
  expiresIn: number;
  devMode: boolean;
}

export interface OTPVerifiedEvent extends OTPEventContext {}

export interface OTPFailedEvent extends OTPEventContext {
  reason: "invalid" | "expired";
  attemptsUsed?: number;
  attemptsRemaining?: number;
}

export interface OTPLockedEvent extends OTPEventContext {
  maxAttempts: number;
  operation: "generate" | "verify";
  lockoutSeconds?: number;
  appliesTo?: OTPLockoutAppliesTo;
  scope?: OTPThrottleScope;
}

export interface OTPRateLimitedEvent extends OTPEventContext {
  window: number;
  max: number;
  scope: OTPThrottleScope;
  algorithm: OTPRateLimitAlgorithm;
}

export interface OTPCooldownBlockedEvent extends OTPEventContext {
  resendCooldown: number;
  scope: OTPThrottleScope;
}

export interface OTPHookErrorContext {
  event:
    | "generated"
    | "verified"
    | "failed"
    | "locked"
    | "rate_limited"
    | "cooldown_blocked";
  payload:
    | OTPGeneratedEvent
    | OTPVerifiedEvent
    | OTPFailedEvent
    | OTPLockedEvent
    | OTPRateLimitedEvent
    | OTPCooldownBlockedEvent;
}

export interface OTPHooks {
  onGenerated?: (event: OTPGeneratedEvent) => void | Promise<void>;
  onVerified?: (event: OTPVerifiedEvent) => void | Promise<void>;
  onFailed?: (event: OTPFailedEvent) => void | Promise<void>;
  onLocked?: (event: OTPLockedEvent) => void | Promise<void>;
  onRateLimited?: (event: OTPRateLimitedEvent) => void | Promise<void>;
  onCooldownBlocked?: (event: OTPCooldownBlockedEvent) => void | Promise<void>;
  onHookError?: (error: unknown, context: OTPHookErrorContext) => void | Promise<void>;
  throwOnError?: boolean;
}

export interface OTPManagerOptions {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
  rateLimit?: RateLimitConfig;
  cooldown?: OTPCooldownConfig;
  lockout?: OTPLockoutConfig;
  devMode?: boolean;
  otpLength?: number;
  resendCooldown?: number;
  identifierNormalization?: IdentifierNormalizationConfig;
  hashing?: OTPHashingOptions;
  hooks?: OTPHooks;
}

export interface GenerateOTPResult {
  expiresIn: number;
  otp?: string;
}

export interface StoreAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  increment(key: string, ttlSeconds: number): Promise<number>;
}

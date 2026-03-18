export type OTPChannel = "email" | "sms" | "token" | (string & {});

export interface OTPPayload {
  type: OTPChannel;
  identifier: string;
  intent?: string;
}

export interface GenerateOTPInput extends OTPPayload {}

export interface VerifyOTPInput extends OTPPayload {
  otp: string;
}

export interface RateLimitConfig {
  window: number;
  max: number;
}

export interface OTPManagerOptions {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
  rateLimit?: RateLimitConfig;
  devMode?: boolean;
  otpLength?: number;
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

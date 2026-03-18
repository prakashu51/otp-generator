import type { OTPPayload } from "../core/otp.types.js";

function normalizeIntent(intent?: string): string {
  return intent ?? "default";
}

export function buildOtpKey(payload: OTPPayload): string {
  return `otp:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildAttemptsKey(payload: OTPPayload): string {
  return `attempts:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildRateLimitKey(payload: OTPPayload): string {
  return `rate:${payload.type}:${payload.identifier}`;
}

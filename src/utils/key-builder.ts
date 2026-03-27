import type { OTPPayload, OTPThrottleScope } from "../core/otp.types.js";

function normalizeIntent(intent?: string): string {
  return intent ?? "default";
}

function buildScopedSegments(payload: OTPPayload, scope: OTPThrottleScope): string[] {
  switch (scope) {
    case "identifier":
      return [payload.identifier];
    case "intent":
      return [normalizeIntent(payload.intent), payload.identifier];
    case "channel":
      return [payload.type, payload.identifier];
    case "intent_channel":
      return [normalizeIntent(payload.intent), payload.type, payload.identifier];
    default:
      return [payload.type, payload.identifier];
  }
}

export function buildOtpKey(payload: OTPPayload): string {
  return `otp:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildAttemptsKey(payload: OTPPayload): string {
  return `attempts:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildRateLimitKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "channel",
): string {
  return `rate:${buildScopedSegments(payload, scope).join(":")}`;
}

export function buildCooldownKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "intent_channel",
): string {
  return `cooldown:${buildScopedSegments(payload, scope).join(":")}`;
}

export function buildLockKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "intent_channel",
): string {
  return `lock:${buildScopedSegments(payload, scope).join(":")}`;
}

export function buildTokenKey(payload: OTPPayload): string {
  return `token:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildTokenAttemptsKey(payload: OTPPayload): string {
  return `token-attempts:${normalizeIntent(payload.intent)}:${payload.type}:${payload.identifier}`;
}

export function buildTokenRateLimitKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "channel",
): string {
  return `token-rate:${buildScopedSegments(payload, scope).join(":")}`;
}

export function buildTokenCooldownKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "intent_channel",
): string {
  return `token-cooldown:${buildScopedSegments(payload, scope).join(":")}`;
}

export function buildTokenLockKey(
  payload: OTPPayload,
  scope: OTPThrottleScope = "intent_channel",
): string {
  return `token-lock:${buildScopedSegments(payload, scope).join(":")}`;
}


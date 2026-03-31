import {
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
  VerificationSecretAlreadyUsedError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
  OTPExpiredError,
  OTPInvalidError,
} from "../errors/otp.errors.js";
import type {
  BuildVerificationResultLinkOptions,
  OTPClassifiedVerificationError,
  OTPVerificationOutcome,
} from "../core/otp.types.js";

export function classifyVerificationError(error: unknown): OTPClassifiedVerificationError {
  if (error instanceof VerificationSecretAlreadyUsedError) {
    return { kind: "already_used", code: error.code, errorName: error.name, retryable: false };
  }

  if (error instanceof VerificationSecretExpiredError || error instanceof OTPExpiredError) {
    return { kind: "expired", code: error.code, errorName: error.name, retryable: false };
  }

  if (error instanceof VerificationSecretInvalidError || error instanceof OTPInvalidError) {
    return { kind: "invalid", code: error.code, errorName: error.name, retryable: true };
  }

  if (error instanceof OTPLockedError) {
    return { kind: "locked", code: error.code, errorName: error.name, retryable: true };
  }

  if (error instanceof OTPRateLimitExceededError) {
    return { kind: "rate_limited", code: error.code, errorName: error.name, retryable: true };
  }

  if (error instanceof OTPMaxAttemptsExceededError) {
    return { kind: "max_attempts", code: error.code, errorName: error.name, retryable: false };
  }

  if (error instanceof OTPResendCooldownError) {
    return { kind: "cooldown_blocked", code: error.code, errorName: error.name, retryable: true };
  }

  const maybeError = error as { code?: unknown; name?: unknown } | undefined;
  return {
    kind: "unknown",
    code: typeof maybeError?.code === "string" ? maybeError.code : undefined,
    errorName: typeof maybeError?.name === "string" ? maybeError.name : undefined,
    retryable: false,
  };
}

export function getVerificationOutcome(input: { verified?: boolean; error?: unknown }): OTPVerificationOutcome {
  if (input.verified) {
    return "verified";
  }

  if (input.error !== undefined) {
    return classifyVerificationError(input.error).kind;
  }

  return "unknown";
}

export function buildVerificationResultLink(options: BuildVerificationResultLinkOptions): string {
  if (!options.baseUrl?.trim()) {
    throw new TypeError("baseUrl must be a non-empty string.");
  }

  const url = new URL(options.baseUrl);
  const outcomeParam = options.paramNames?.outcome ?? "outcome";
  const codeParam = options.paramNames?.code ?? "code";
  url.searchParams.set(outcomeParam, options.outcome);

  if (options.code) {
    url.searchParams.set(codeParam, options.code);
  }

  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

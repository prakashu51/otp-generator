# Error Reference

## OTPInvalidError
Thrown when an OTP exists for the given scope but the provided value is incorrect and the attempt threshold has not yet been exhausted.

## OTPExpiredError
Thrown when there is no active OTP for the given scope. This usually means the OTP expired, was already consumed, or was removed after successful verification.

## OTPMaxAttemptsExceededError
Thrown when the configured `maxAttempts` threshold is exhausted in flows that do not use a separate lock window.

## OTPResendCooldownError
Thrown when generation is attempted during an active cooldown window.

## OTPRateLimitExceededError
Thrown when generation exceeds the configured rate limit window.

## OTPLockedError
Thrown when a lock window is active or when verification triggers a lockout according to the configured `lockout` policy.

## Practical notes
- `OTPExpiredError` after a successful verify is expected because OTPs are one-time use.
- `OTPLockedError` is separate from `OTPMaxAttemptsExceededError` because lock windows can continue blocking future generate or verify calls for a time period.
- for public APIs, map these package errors to your own HTTP or RPC error shape instead of leaking internal details directly.

# Stability Guide

## Stable public surface

The following package entry points are stable as of `v1.0.0`:
- `OTPManager`
- `RedisAdapter`
- `MemoryAdapter`
- exported error classes
- exported config and hook event types
- Nest integration subpath `redis-otp-manager/nest`

## Backward compatibility guarantees

The package currently preserves these older flows:
- legacy `resendCooldown` configuration still works
- simple `rateLimit` configuration still works
- non-HMAC generation and verification still work when no `hashing.secret` is configured
- legacy SHA-256 verification remains available during HMAC migration by default
- CommonJS and ESM consumers are both supported

## Config precedence

When overlapping configuration is present, the package resolves behavior this way:
- `cooldown` takes precedence over legacy `resendCooldown`
- explicit `rateLimit.scope` wins over the internal default of `channel`
- explicit `rateLimit.algorithm` wins over the internal default of `fixed_window`
- explicit `lockout.appliesTo` wins over the internal default of `both`
- explicit `lockout.scope` wins over the internal default of `intent_channel`
- `hooks.throwOnError: true` makes hook failures block the OTP flow intentionally

## Deprecated but supported

These are still supported and not removed in `0.9.0`:
- `resendCooldown`
- legacy SHA-256 verification during HMAC migration

They are still valid, but newer policy-based configuration is recommended for new integrations.


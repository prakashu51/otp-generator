# Migration Guide

## 0.2.x to 0.3.0
- Redis-backed verify became atomic to prevent double-success races.
- no public API rename was required for existing generate and verify usage.

## 0.3.x to 0.4.0
- HMAC support was added through `hashing.secret`.
- `previousSecrets` enables secret rotation.
- legacy SHA-256 verification remains available by default to ease migration.

## 0.4.x to 0.5.0
- hook-based observability and request metadata were added.
- hooks are optional and non-blocking by default.

## 0.5.x to 0.6.0
- richer cooldown, lockout, and scoped throttling policies were added.
- legacy `resendCooldown` still remains supported.
- Redis sliding-window rate limiting requires `RedisAdapter`.

## 0.6.x to 0.7.0
- no user-facing OTP flow change was required.
- Redis confidence and compatibility checks were added through CI and integration coverage.

## 0.7.x to 0.8.0
- no runtime behavior change is required.
- this release focuses on docs, migration clarity, examples, and developer onboarding.

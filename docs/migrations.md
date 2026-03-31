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

## 1.0.x to 1.1.0
- `generateToken()` and `verifyToken()` were added as additive APIs.
- existing `generate()` and `verify()` behavior remains unchanged.
- token flow uses separate Redis key namespaces to avoid collisions with OTP flow.


## 1.1.x to 1.2.0
- token flows now return `VerificationSecretExpiredError` and `VerificationSecretInvalidError` for expired and invalid token verification.
- OTP flows continue returning the existing OTP-specific errors.
- hook payloads now include additive `credentialKind` values so OTP and token events can be distinguished in logs.



## 1.2.x to 1.3.0
- `buildVerificationLink()` was added for provider-agnostic verification-link construction.
- `buildTokenDeliveryPayload()` was added to prepare token delivery data for your app-side email or magic-link flows.
- existing OTP and token generation and verification APIs remain unchanged.


## 1.3.x to 1.4.0
- optional `auditAdapter` and `deliveryAdapter` support was added.
- `generateAndSend()` and `generateTokenAndSend()` were added as explicit send helpers.
- existing `generate()`, `verify()`, `generateToken()`, and `verifyToken()` behavior remains unchanged.


## 1.4.x to 1.5.0
- optional `replayProtection` was added for token verification flows.
- when enabled, repeated verification of a successfully used token can now return `VerificationSecretAlreadyUsedError`.
- OTP flow and default token flow behavior remain unchanged when replay protection is not configured.

## 1.5.x to 1.6.0
- classifyVerificationError() was added to map package errors into stable verification helper kinds.
- getVerificationOutcome() was added for app-side success and failure outcome handling.
- uildVerificationResultLink() was added for redirect-friendly verification callback flows.
- existing OTP and token generation and verification APIs remain unchanged.


# redis-otp-manager

Lightweight, Redis-backed OTP manager for Node.js and NestJS apps.

`redis-otp-manager` gives you a production-focused OTP engine with Redis TTL storage, atomic Redis verification, cryptographic hardening, observability hooks, and abuse-control policies without forcing a delivery provider.

## Why Use It

- Redis-backed OTP storage with TTL cleanup
- Atomic Redis generate and verify paths
- HMAC hashing with secret rotation support
- Cooldown, rate limiting, and lockout controls
- Hook-based observability with metadata context
- Works with plain Node.js and NestJS
- Supports both ESM and CommonJS consumers

## Install

```bash
npm install redis-otp-manager
```

## Quick Start

```ts
import { OTPManager, RedisAdapter } from "redis-otp-manager";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  devMode: false,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
  rateLimit: {
    window: 60,
    max: 3,
  },
});

const generated = await otp.generate({
  type: "email",
  identifier: "user@example.com",
  intent: "login",
});

await otp.verify({
  type: "email",
  identifier: "user@example.com",
  intent: "login",
  otp: "123456",
});
```

## Feature Overview

### Core Flows
- OTP generation and verification
- Verification token generation and verification
- Intent-aware keying
- In-memory adapter for tests
- NestJS module export via `redis-otp-manager/nest`

### Security
- Keyed HMAC support through `hashing.secret`
- Secret rotation with `previousSecrets`
- Legacy SHA-256 verification support for migrations
- Atomic Redis verification to prevent double-success races

### Abuse Controls
- Cooldown policy support
- Fixed-window and Redis sliding-window rate limiting
- Scoped throttling by identifier, intent, channel, or intent + channel
- Temporary lock windows after repeated failed verification attempts

### Observability
- Lifecycle hooks for generated, verified, failed, locked, rate-limited, and cooldown-blocked events
- Additive `credentialKind` in hook payloads so OTP and token flows are distinguishable
- Request-scoped metadata passed to hook payloads
- Non-blocking hook error handling by default

## Examples

- Plain Node: [examples/node-basic/README.md](./examples/node-basic/README.md)
- NestJS: [examples/nest-basic/README.md](./examples/nest-basic/README.md)
- Express: [examples/express-basic/README.md](./examples/express-basic/README.md)
- Verification Links: [examples/node-token-link/README.md](./examples/node-token-link/README.md)

## Configuration

### OTPManager options

```ts
type OTPManagerOptions = {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
  otpLength?: number;
  devMode?: boolean;
  resendCooldown?: number;
  cooldown?: {
    seconds: number;
    scope?: "identifier" | "intent" | "channel" | "intent_channel";
  };
  rateLimit?: {
    window: number;
    max: number;
    scope?: "identifier" | "intent" | "channel" | "intent_channel";
    algorithm?: "fixed_window" | "sliding_window";
  };
  lockout?: {
    seconds: number;
    afterAttempts: number;
    appliesTo?: "verify" | "generate" | "both";
    scope?: "identifier" | "intent" | "channel" | "intent_channel";
  };
  hashing?: {
    secret?: string;
    previousSecrets?: string[];
    allowLegacyVerify?: boolean;
  };
};
```

### Backward compatibility notes
- `resendCooldown` still works and remains supported.
- `cooldown` is the richer replacement for policy-based cooldown configuration.
- legacy SHA-256 verification is still supported by default when migrating to HMAC.
- CommonJS and ESM consumers are both supported.

### Config precedence
- `cooldown` takes precedence over legacy `resendCooldown` when both are provided.
- `rateLimit.scope` defaults to `channel`.
- `rateLimit.algorithm` defaults to `fixed_window`.
- `lockout.appliesTo` defaults to `both`.
- `lockout.scope` defaults to `intent_channel`.
- `hooks.throwOnError` defaults to non-blocking behavior unless explicitly set to `true`.

## Stable API

`v1.0.0` is the first stable production release of `redis-otp-manager`.

The following public surface is considered stable:
- `OTPManager`
- `RedisAdapter`
- `MemoryAdapter`
- exported error classes
- exported hook and config types
- `redis-otp-manager/nest`

Full stability notes: [docs/stability.md](./docs/stability.md)

## Error Reference

The package can throw these errors:
- `OTPRateLimitExceededError`
- `OTPExpiredError`
- `OTPInvalidError`
- `VerificationSecretExpiredError`
- `VerificationSecretInvalidError`
- `OTPMaxAttemptsExceededError`
- `OTPResendCooldownError`
- `OTPLockedError`

Detailed behavior reference: [docs/errors.md](./docs/errors.md)

## Production Recommendations

- keep `devMode: false` in production
- use `hashing.secret` in production
- prefer `RedisAdapter` in production
- keep Redis private and never publicly exposed
- use HTTPS for all OTP or token delivery flows
- keep `maxAttempts` low, typically `3`
- enable cooldown and rate limiting for public endpoints
- use lockout windows for abuse-heavy flows

More guidance: [docs/production.md](./docs/production.md)

## Migration Guides

Version-to-version migration notes live in [docs/migrations.md](./docs/migrations.md).

## Reliability And Compatibility

Current package validation includes:
- real Redis integration tests against a live Redis server
- Redis-backed CI validation for TTL, lockout, cooldown, and sliding-window behavior
- ESM and CommonJS smoke checks against the built package output
- Nest integration smoke coverage in CI

## Tested Scenarios

The package is currently validated for:
- in-memory unit and behavior tests
- fake Redis atomic behavior tests
- real Redis integration tests in CI
- NestJS provider smoke coverage
- ESM and CommonJS package smoke checks

## Feedback And Support

If you run into a bug, unexpected behavior, or have a feature request, open an issue here:
- Bug reports: https://github.com/prakashu51/otp-generator/issues
- Feature requests: https://github.com/prakashu51/otp-generator/issues

When reporting, please include:
- package version
- Node.js version
- adapter used (`RedisAdapter` or `MemoryAdapter`)
- minimal reproduction steps
- expected behavior and actual behavior

## Token Flow

Use `generateToken()` and `verifyToken()` when you want email verification links or magic-link style flows without changing the existing OTP API.

Token verification returns token-friendly generic secret errors such as `VerificationSecretExpiredError` and `VerificationSecretInvalidError`, while the OTP flow keeps the original OTP error classes.

```ts
const generated = await otp.generateToken({
  type: "email",
  identifier: "user@example.com",
  intent: "verify-email",
});

await otp.verifyToken({
  type: "email",
  identifier: "user@example.com",
  intent: "verify-email",
  token: generated.token ?? "",
});
```

## Post-1.0.0 Roadmap

- Delivery helpers for email links and magic-link style verification
- Additional audit and delivery adapters
- Richer token and verification-link workflow helpers









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

### Core flows
- OTP generation and verification
- intent-aware keying
- in-memory adapter for tests
- NestJS module export via `redis-otp-manager/nest`

### Security
- keyed HMAC support through `hashing.secret`
- secret rotation with `previousSecrets`
- legacy SHA-256 verification support for migrations
- atomic Redis verification to prevent double-success races

### Abuse controls
- cooldown policy support
- fixed-window and Redis sliding-window rate limiting
- scoped throttling by identifier, intent, channel, or intent + channel
- temporary lock windows after repeated failed verification attempts

### Observability
- lifecycle hooks for generated, verified, failed, locked, rate-limited, and cooldown-blocked events
- request-scoped metadata passed to hook payloads
- non-blocking hook error handling by default

## Plain Node Example

See [examples/node-basic/README.md](./examples/node-basic/README.md).

## NestJS Example

See [examples/nest-basic/README.md](./examples/nest-basic/README.md).

## Express Example

See [examples/express-basic/README.md](./examples/express-basic/README.md).

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

### Backward compatibility notes`r`n- `resendCooldown` still works and remains supported.`r`n- `cooldown` is the richer replacement for policy-based cooldown configuration.`r`n- legacy SHA-256 verification is still supported by default when migrating to HMAC.`r`n- CommonJS and ESM consumers are both supported.`r`n`r`n### Config precedence`r`n- `cooldown` takes precedence over legacy `resendCooldown` when both are provided.`r`n- `rateLimit.scope` defaults to `channel`.`r`n- `rateLimit.algorithm` defaults to `fixed_window`.`r`n- `lockout.appliesTo` defaults to `both`.`r`n- `lockout.scope` defaults to `intent_channel`.`r`n- `hooks.throwOnError` defaults to non-blocking behavior unless explicitly set to `true`.

## Stable API`r`n`r`nThe following public surface is intended to remain stable into `v1.0.0`:`r`n- `OTPManager``r`n- `RedisAdapter``r`n- `MemoryAdapter``r`n- exported error classes`r`n- exported hook and config types`r`n- `redis-otp-manager/nest``r`n`r`nFull stability notes: [docs/stability.md](./docs/stability.md)`r`n`r`n## Error Reference

The package can throw these errors:
- `OTPRateLimitExceededError`
- `OTPExpiredError`
- `OTPInvalidError`
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

`v0.7.0` added:
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

## Roadmap Toward v1.0.0`r`n`r`n- final release-candidate cleanup and packaging confidence`r`n- optional delivery helpers for email links and magic-link style verification`r`n- post-1.0.0 token and verification-link flows


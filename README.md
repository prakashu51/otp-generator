# redis-otp-manager

Lightweight, Redis-backed OTP manager for Node.js and NestJS apps.

## Current Features

This package currently includes:
- OTP generation
- OTP verification
- Keyed HMAC support with app secret configuration
- Secret rotation support for verification
- Legacy SHA-256 verification compatibility for migrations
- Hook-based observability events
- Structured metadata support for audit and logging context
- Redis-compatible storage adapter
- In-memory adapter for tests
- Intent-aware key strategy
- Conservative identifier normalization
- Rate limiting
- Optional resend cooldown
- Max-attempt protection
- Atomic Redis generate and verify paths using Lua scripts
- NestJS module integration via `redis-otp-manager/nest`
- Dual package support for ESM and CommonJS consumers

## Install

```bash
npm install redis-otp-manager
```

For NestJS apps, also install the Nest peer dependencies used by your app:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quality Checks

```bash
npm run check
```

## Quick Start

```ts
import { OTPManager, RedisAdapter } from "redis-otp-manager";

const redisClient = /* your redis client */;

const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 5,
  resendCooldown: 45,
  rateLimit: {
    window: 60,
    max: 3,
  },
  devMode: false,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
});
```

## Observability Hooks

`v0.5.0` adds hook-based observability without changing the core OTP flow.

```ts
const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  hooks: {
    onGenerated: async (event) => logger.info("otp_generated", event),
    onVerified: async (event) => logger.info("otp_verified", event),
    onFailed: async (event) => logger.warn("otp_failed", event),
    onLocked: async (event) => logger.warn("otp_locked", event),
    onRateLimited: async (event) => logger.warn("otp_rate_limited", event),
    onCooldownBlocked: async (event) => logger.warn("otp_cooldown_blocked", event),
    onHookError: async (error, context) => logger.error("otp_hook_error", { error, context }),
  },
});
```

Supported lifecycle hooks:
- `onGenerated`
- `onVerified`
- `onFailed`
- `onLocked`
- `onRateLimited`
- `onCooldownBlocked`
- `onHookError`

Default behavior:
- hooks are optional
- hook execution is non-blocking by default
- hook failures do not break OTP generation or verification unless `throwOnError: true`

## Structured Metadata

You can pass request-scoped metadata into both `generate()` and `verify()`.
This metadata is forwarded to hooks but is not stored in Redis.

```ts
await otp.generate({
  type: "email",
  identifier: "user@example.com",
  intent: "login",
  metadata: {
    requestId: "req_123",
    userId: "user_42",
    ip: "203.0.113.10",
  },
});
```

## Cryptographic Hardening

When `hashing.secret` is configured, new OTPs are stored using keyed HMAC instead of plain SHA-256.

```ts
const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
    previousSecrets: [process.env.OTP_PREVIOUS_SECRET ?? ""].filter(Boolean),
    allowLegacyVerify: true,
  },
});
```

Recommended migration strategy:
- deploy `hashing.secret`
- keep `allowLegacyVerify: true` during migration
- optionally add `previousSecrets` during secret rotation
- after old in-flight OTPs naturally expire, you can disable legacy verification if desired

## Production Security Notes

When you use `RedisAdapter`, the package takes the Redis-specific atomic path for:
- OTP generation plus rate-limit/cooldown checks
- OTP verification plus attempt tracking and OTP deletion

That prevents the most important race condition from earlier versions where two parallel correct verification requests could both succeed.

Simpler adapters like `MemoryAdapter` intentionally stay on the non-atomic fallback path to keep tests and local development lightweight.

## API

### `new OTPManager(options)`

```ts
type OTPManagerOptions = {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
  resendCooldown?: number;
  rateLimit?: {
    window: number;
    max: number;
  };
  devMode?: boolean;
  otpLength?: number;
  identifierNormalization?: {
    trim?: boolean;
    lowercase?: boolean;
    preserveCaseFor?: string[];
  };
  hashing?: {
    secret?: string;
    previousSecrets?: string[];
    allowLegacyVerify?: boolean;
  };
  hooks?: {
    onGenerated?: (event) => void | Promise<void>;
    onVerified?: (event) => void | Promise<void>;
    onFailed?: (event) => void | Promise<void>;
    onLocked?: (event) => void | Promise<void>;
    onRateLimited?: (event) => void | Promise<void>;
    onCooldownBlocked?: (event) => void | Promise<void>;
    onHookError?: (error, context) => void | Promise<void>;
    throwOnError?: boolean;
  };
};
```

### Errors

- `OTPRateLimitExceededError`
- `OTPExpiredError`
- `OTPInvalidError`
- `OTPMaxAttemptsExceededError`
- `OTPResendCooldownError`

## Safer Production Defaults

- `devMode: false`
- `otpLength: 8` for higher-risk flows
- `maxAttempts: 3`
- `resendCooldown: 30` or higher
- `hashing.secret` configured in production
- prefer `RedisAdapter` in production to get the atomic security path
- keep Redis private and behind authenticated network access

## Release Automation

Publishing on every `main` merge is not recommended for npm packages because npm versions are immutable. The safer setup is:
- merge to `main` runs CI only
- publish happens when you push a version tag like `v0.5.0`

Required GitHub secrets:
- `NPM_TOKEN`

## Next Roadmap

- analytics and observability integrations
- delivery helper integrations
- more advanced audit persistence adapters

# redis-otp-manager

Lightweight, Redis-backed OTP manager for Node.js and NestJS apps.

## Current Features

This package currently includes:
- OTP generation
- OTP verification
- Keyed HMAC support with app secret configuration
- Secret rotation support for verification
- Legacy SHA-256 verification compatibility for migrations
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

## Module Support

This package supports both:
- ESM imports
- CommonJS/Nest `ts-node/register` style resolution

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

Secure secret management guidance:
- store secrets in environment variables or your secret manager
- never hardcode secrets in source control
- rotate secrets deliberately and keep the previous secret only as long as needed
- use different secrets across environments

## Production Security Notes

When you use `RedisAdapter`, the package takes the Redis-specific atomic path for:
- OTP generation plus rate-limit/cooldown checks
- OTP verification plus attempt tracking and OTP deletion

That prevents the most important race condition from earlier versions where two parallel correct verification requests could both succeed.

Simpler adapters like `MemoryAdapter` intentionally stay on the non-atomic fallback path to keep tests and local development lightweight.

## NestJS

```ts
import { Module } from "@nestjs/common";
import { createClient } from "redis";
import { OTPManager, RedisAdapter } from "redis-otp-manager";
import { OTPModule, InjectOTPManager } from "redis-otp-manager/nest";

const redisClient = createClient({ url: process.env.REDIS_URL });

@Module({
  imports: [
    OTPModule.forRoot({
      store: new RedisAdapter(redisClient),
      ttl: 300,
      maxAttempts: 5,
      resendCooldown: 45,
      rateLimit: {
        window: 60,
        max: 3,
      },
      hashing: {
        secret: process.env.OTP_HMAC_SECRET,
      },
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

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

## Key Design

```txt
otp:{intent}:{type}:{identifier}
attempts:{intent}:{type}:{identifier}
rate:{type}:{identifier}
cooldown:{intent}:{type}:{identifier}
```

## Release Automation

Publishing on every `main` merge is not recommended for npm packages because npm versions are immutable. The safer setup is:
- merge to `main` runs CI only
- publish happens when you push a version tag like `v0.4.0`

Required GitHub secrets:
- `NPM_TOKEN`

Tag-based publish:

```bash
git tag v0.4.0
git push origin v0.4.0
```

## Next Roadmap

- hooks/events
- analytics and observability
- delivery helper integrations

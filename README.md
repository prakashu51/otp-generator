# redis-otp-manager

Lightweight, Redis-backed OTP manager for Node.js and NestJS apps.

## Current Features

This package currently includes:
- OTP generation
- OTP verification
- SHA-256 OTP hashing
- Redis-compatible storage adapter
- In-memory adapter for tests
- Intent-aware key strategy
- Conservative identifier normalization
- Rate limiting
- Optional resend cooldown
- Max-attempt protection
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

This package now supports both:
- ESM imports
- CommonJS/Nest `ts-node/register` style resolution

ESM:

```ts
import { OTPManager } from "redis-otp-manager";
import { OTPModule } from "redis-otp-manager/nest";
```

CommonJS:

```js
const { OTPManager } = require("redis-otp-manager");
const { OTPModule } = require("redis-otp-manager/nest");
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
});

const generated = await otp.generate({
  type: "email",
  identifier: "abc@gmail.com",
  intent: "login",
});

await otp.verify({
  type: "email",
  identifier: "abc@gmail.com",
  intent: "login",
  otp: generated.otp ?? "123456",
});
```

## NestJS

Import the Nest integration from the dedicated subpath so non-Nest users do not pull Nest dependencies unless they need them.

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
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

Async setup is also supported:

```ts
OTPModule.forRootAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    store: new RedisAdapter(createClient({ url: config.getOrThrow("REDIS_URL") })),
    ttl: 300,
    maxAttempts: 5,
    resendCooldown: 45,
  }),
});
```

Inject in services:

```ts
import { Injectable } from "@nestjs/common";
import { OTPManager } from "redis-otp-manager";
import { InjectOTPManager } from "redis-otp-manager/nest";

@Injectable()
export class AuthService {
  constructor(@InjectOTPManager() private readonly otpManager: OTPManager) {}
}
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
};
```

Normalization is backward-compatible and conservative by default:
- identifiers are trimmed
- identifiers are lowercased for most channels
- `sms` and `token` preserve case by default

### `generate(input)`

```ts
const result = await otp.generate({
  type: "email",
  identifier: "abc@gmail.com",
  intent: "login",
});
```

Returns:

```ts
{
  expiresIn: 300,
  otp?: "123456"
}
```

### `verify(input)`

```ts
await otp.verify({
  type: "email",
  identifier: "abc@gmail.com",
  intent: "login",
  otp: "123456",
});
```

Returns `true` or throws a typed error.

## Errors

- `OTPRateLimitExceededError`
- `OTPExpiredError`
- `OTPInvalidError`
- `OTPMaxAttemptsExceededError`
- `OTPResendCooldownError`

## Safer Production Defaults

- `devMode: false`
- `otpLength: 8` for higher-risk flows
- `maxAttempts: 3`
- `resendCooldown: 30` or higher to reduce abuse
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
- publish happens when you push a version tag like `v0.2.0`

Required GitHub secrets:
- `NPM_TOKEN`

Tag-based publish:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Next Roadmap

- atomic Redis verification
- hooks/events
- analytics and observability

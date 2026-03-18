# redis-otp-manager

Lightweight, Redis-backed OTP manager for Node.js apps.

## Current MVP

This first implementation includes:
- OTP generation
- OTP verification
- SHA-256 OTP hashing
- Redis-compatible storage adapter
- In-memory adapter for tests
- Intent-aware key strategy
- Rate limiting
- Max-attempt protection

## Install

```bash
npm install redis-otp-manager
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
  rateLimit: {
    window: 60,
    max: 3,
  },
  devMode: process.env.NODE_ENV !== "production",
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

## API

### `new OTPManager(options)`

```ts
type OTPManagerOptions = {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
  rateLimit?: {
    window: number;
    max: number;
  };
  devMode?: boolean;
  otpLength?: number;
};
```

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

## Key Design

```txt
otp:{intent}:{type}:{identifier}
attempts:{intent}:{type}:{identifier}
rate:{type}:{identifier}
```

## Next Roadmap

- NestJS module and decorator
- alphanumeric tokens
- hooks/events
- email token helpers


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
- Policy-based resend cooldown
- Lock windows for abuse control
- Scoped throttling by identifier, intent, channel, or combined intent+channel
- Optional Redis sliding-window rate limiting
- Redis-compatible storage adapter
- In-memory adapter for tests
- Atomic Redis generate and verify paths using Lua scripts
- NestJS module integration via `redis-otp-manager/nest`
- Dual package support for ESM and CommonJS consumers

## Install

```bash
npm install redis-otp-manager
```

## Throughput And Abuse Controls

`v0.6.0` introduces richer abuse-control policies while keeping older simple config forms working.

```ts
const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 5,
  cooldown: {
    seconds: 30,
    scope: "intent_channel",
  },
  rateLimit: {
    window: 60,
    max: 3,
    scope: "intent_channel",
    algorithm: "fixed_window",
  },
  lockout: {
    seconds: 300,
    afterAttempts: 3,
    appliesTo: "both",
    scope: "intent_channel",
  },
});
```

### Cooldown Policy

Supported scopes:
- `identifier`
- `intent`
- `channel`
- `intent_channel`

Legacy `resendCooldown` still works and maps to the previous default behavior.

### Lock Windows

Lock windows set a temporary lock after repeated abuse and can block:
- `verify`
- `generate`
- `both`

A locked target throws `OTPLockedError`.

### Rate Limiting

Supported algorithms:
- `fixed_window`
- `sliding_window`

`sliding_window` currently requires `RedisAdapter`.

## Observability Hooks

You can observe:
- `generated`
- `verified`
- `failed`
- `locked`
- `rate_limited`
- `cooldown_blocked`

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
  },
});
```

## Cryptographic Hardening

When `hashing.secret` is configured, new OTPs are stored using keyed HMAC instead of plain SHA-256.

```ts
hashing: {
  secret: process.env.OTP_HMAC_SECRET,
  previousSecrets: [process.env.OTP_PREVIOUS_SECRET ?? ""].filter(Boolean),
  allowLegacyVerify: true,
}
```

## Safer Production Defaults

- `devMode: false`
- `otpLength: 8` for higher-risk flows
- `maxAttempts: 3`
- `cooldown.seconds: 30` or higher
- `lockout.seconds: 300` after repeated failures
- `hashing.secret` configured in production
- prefer `RedisAdapter` in production to get atomic and sliding-window paths

## API

```ts
type OTPManagerOptions = {
  store: StoreAdapter;
  ttl: number;
  maxAttempts: number;
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
};
```

## Errors

- `OTPRateLimitExceededError`
- `OTPExpiredError`
- `OTPInvalidError`
- `OTPMaxAttemptsExceededError`
- `OTPResendCooldownError`
- `OTPLockedError`

## Next Roadmap

- analytics and observability integrations
- delivery helper integrations
- more advanced audit persistence adapters

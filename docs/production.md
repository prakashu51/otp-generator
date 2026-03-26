# Production Guide

## Recommended baseline

```ts
new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  devMode: false,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
  cooldown: {
    seconds: 30,
    scope: "intent_channel",
  },
  rateLimit: {
    window: 60,
    max: 3,
    scope: "intent_channel",
  },
  lockout: {
    seconds: 300,
    afterAttempts: 3,
    appliesTo: "both",
    scope: "intent_channel",
  },
});
```

## Security checklist
- keep `devMode: false` in production
- set `hashing.secret` from a secret manager or environment variable
- keep Redis on a private network
- use TLS or secure networking for Redis where possible
- use HTTPS for all delivery flows
- keep OTP length and TTL appropriate for risk level

## Operational guidance
- use cooldown and rate limit on public endpoints
- use lockout on abuse-heavy flows
- use hooks for audit and logging context
- prefer `RedisAdapter` over memory storage in production
- verify secret rotation in staging before rotating in production

## What this package does not do for you
- it does not send email or SMS by itself
- it does not persist audit events to your database by default
- it does not replace transport security or account-level fraud controls

# Verification Link Example

This example shows the complete provider-agnostic flow:
- generate a token
- build a verification URL
- prepare a delivery payload for your email layer
- verify the token in your callback route

## Generate the verification URL

```ts
import {
  OTPManager,
  RedisAdapter,
  buildTokenDeliveryPayload,
  buildVerificationLink,
  buildVerificationResultLink,
  classifyVerificationError,
  getVerificationOutcome,
} from "redis-otp-manager";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 1800,
  maxAttempts: 3,
  devMode: true,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
  replayProtection: {
    enabled: true,
    ttl: 3600,
  },
});

const generated = await otp.generateToken({
  type: "email",
  identifier: "user@example.com",
  intent: "verify-email",
});

const verificationUrl = buildVerificationLink({
  baseUrl: "https://your-app.com/verify-email",
  token: generated.token ?? "",
  identifier: "user@example.com",
  intent: "verify-email",
  type: "email",
});

const deliveryPayload = buildTokenDeliveryPayload({
  baseUrl: "https://your-app.com/verify-email",
  token: generated.token ?? "",
  identifier: "user@example.com",
  intent: "verify-email",
  type: "email",
  expiresIn: generated.expiresIn,
});

console.log(verificationUrl);
console.log(deliveryPayload);
```

## Verify the token from your callback route

```ts
const result = await otp.verifyToken({
  type: "email",
  identifier: req.query.identifier as string,
  intent: "verify-email",
  token: req.query.token as string,
});

if (result) {
  // mark email as verified in your database
}
```

The helper utilities stay provider-agnostic:
- `buildVerificationLink()` gives you a ready-to-send URL
- `buildTokenDeliveryPayload()` gives you a small structured payload for your email template or delivery layer


With `replayProtection` enabled, a repeated click on the same verification URL can return `VerificationSecretAlreadyUsedError` instead of the generic expired response.
## Optional callback result handling

```ts
try {
  await otp.verifyToken({
    type: "email",
    identifier: req.query.identifier as string,
    intent: "verify-email",
    token: req.query.token as string,
  });

  const successLink = buildVerificationResultLink({
    baseUrl: "https://your-app.com/verify-email/result",
    outcome: getVerificationOutcome({ verified: true }),
  });

  res.redirect(successLink);
} catch (error) {
  const failureLink = buildVerificationResultLink({
    baseUrl: "https://your-app.com/verify-email/result",
    outcome: getVerificationOutcome({ error }),
    code: classifyVerificationError(error).code,
  });

  res.redirect(failureLink);
}
```

# Verification Link Example

```ts
import {
  OTPManager,
  RedisAdapter,
  buildTokenDeliveryPayload,
  buildVerificationLink,
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

await otp.verifyToken({
  type: "email",
  identifier: "user@example.com",
  intent: "verify-email",
  token: generated.token ?? "",
});
```

Use this flow when you want to send a verification URL by email while keeping token generation and verification inside `redis-otp-manager`.

The helper utilities stay provider-agnostic:
- `buildVerificationLink()` gives you a ready-to-send URL
- `buildTokenDeliveryPayload()` gives you a small structured payload for your email template or delivery layer

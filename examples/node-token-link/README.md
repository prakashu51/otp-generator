# Verification Link Example

```ts
import { OTPManager, RedisAdapter } from "redis-otp-manager";
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

const verificationUrl = `https://your-app.com/verify-email?token=${generated.token}&email=user@example.com`;
console.log(verificationUrl);

await otp.verifyToken({
  type: "email",
  identifier: "user@example.com",
  intent: "verify-email",
  token: generated.token ?? "",
});
```

Use this flow when you want to send a verification URL by email while keeping token generation and verification inside `redis-otp-manager`.

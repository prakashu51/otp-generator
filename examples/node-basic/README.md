# Node Basic Example

```ts
import { OTPManager, RedisAdapter } from "redis-otp-manager";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  devMode: true,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
});

const generated = await otp.generate({
  type: "email",
  identifier: "user@example.com",
  intent: "login",
});

console.log(generated);

await otp.verify({
  type: "email",
  identifier: "user@example.com",
  intent: "login",
  otp: generated.otp ?? "",
});
```

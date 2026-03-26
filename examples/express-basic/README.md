# Express Basic Example

```ts
import express from "express";
import { createClient } from "redis";
import { OTPManager, RedisAdapter } from "redis-otp-manager";

const app = express();
app.use(express.json());

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  hashing: {
    secret: process.env.OTP_HMAC_SECRET,
  },
});

app.post("/otp/generate", async (req, res) => {
  const result = await otp.generate({
    type: "email",
    identifier: req.body.email,
    intent: "login",
  });

  res.json(result);
});

app.post("/otp/verify", async (req, res) => {
  const valid = await otp.verify({
    type: "email",
    identifier: req.body.email,
    intent: "login",
    otp: req.body.otp,
  });

  res.json({ valid });
});
```

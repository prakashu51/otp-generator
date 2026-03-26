# Nest Basic Example

```ts
import { Module } from "@nestjs/common";
import { createClient } from "redis";
import { OTPModule } from "redis-otp-manager/nest";
import { RedisAdapter } from "redis-otp-manager";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

@Module({
  imports: [
    OTPModule.forRoot({
      store: new RedisAdapter(redisClient),
      ttl: 300,
      maxAttempts: 3,
      hashing: {
        secret: process.env.OTP_HMAC_SECRET,
      },
    }),
  ],
})
export class AppModule {}
```

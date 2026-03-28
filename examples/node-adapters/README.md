# Adapter Usage Example

This example shows how to use the new optional audit and delivery adapters.

## Delivery adapter

```ts
const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  deliveryAdapter: {
    async send(payload) {
      console.log("send", payload);
      // hand off to your email, SMS, or queue layer here
    },
  },
});

await otp.generateAndSend({
  type: "sms",
  identifier: "+911234567890",
  intent: "login",
});

await otp.generateTokenAndSend(
  {
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
  },
  {
    baseUrl: "https://app.example.com/verify-email",
  },
);
```

## Audit adapter

```ts
const otp = new OTPManager({
  store: new RedisAdapter(redisClient),
  ttl: 300,
  maxAttempts: 3,
  auditAdapter: {
    async record(event) {
      console.log("audit", event);
      // persist to your audit table or log pipeline here
    },
  },
});
```

Adapters are optional and provider-agnostic. Existing OTP and token flows continue to work without them.

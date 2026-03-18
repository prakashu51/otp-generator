import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryAdapter,
  OTPExpiredError,
  OTPInvalidError,
  OTPManager,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
} from "../src/index.js";

function createManager() {
  return new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    rateLimit: {
      window: 60,
      max: 2,
    },
    devMode: true,
  });
}

test("generates and verifies an OTP successfully", async () => {
  const manager = createManager();
  const result = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  assert.equal(result.expiresIn, 30);
  assert.match(result.otp ?? "", /^\d{6}$/);

  const verified = await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: result.otp as string,
  });

  assert.equal(verified, true);
});

test("throws invalid error for a wrong OTP before attempts are exhausted", async () => {
  const manager = createManager();

  await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPInvalidError,
  );
});

test("locks verification after max attempts", async () => {
  const manager = createManager();

  await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      manager.verify({
        type: "email",
        identifier: "user@example.com",
        intent: "login",
        otp: "000000",
      }),
      OTPInvalidError,
    );
  }

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPMaxAttemptsExceededError,
  );

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPExpiredError,
  );
});

test("enforces rate limiting on OTP generation", async () => {
  const manager = createManager();

  await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  await assert.rejects(
    manager.generate({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
    }),
    OTPRateLimitExceededError,
  );
});

test("throws when required payload fields are missing", async () => {
  const manager = createManager();

  await assert.rejects(
    manager.generate({
      type: "",
      identifier: "user@example.com",
      intent: "login",
    }),
    TypeError,
  );

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "",
    }),
    TypeError,
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryAdapter,
  OTPExpiredError,
  OTPInvalidError,
  OTPManager,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
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

test("normalizes identifiers so generate and verify match case-insensitively by default", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await manager.generate({
    type: "email",
    identifier: " User@Example.com ",
    intent: "login",
  });

  const verified = await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp as string,
  });

  assert.equal(verified, true);
});

test("preserves token identifier case by default", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await manager.generate({
    type: "token",
    identifier: "CaseSensitiveToken",
    intent: "invite",
  });

  await assert.rejects(
    manager.verify({
      type: "token",
      identifier: "casesensitivetoken",
      intent: "invite",
      otp: generated.otp as string,
    }),
    OTPExpiredError,
  );
});

test("enforces resend cooldown when configured", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    resendCooldown: 60,
    devMode: true,
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
    OTPResendCooldownError,
  );
});

test("supports keyed hmac hashing for new otp generation", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hashing: {
      secret: "current-secret",
    },
  });

  const generated = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const verified = await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp as string,
  });

  assert.equal(verified, true);
});

test("supports secret rotation with previous secrets", async () => {
  const oldManager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hashing: {
      secret: "old-secret",
    },
  });

  const generated = await oldManager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const rotatedManager = new OTPManager({
    store: (oldManager as any).options.store,
    ttl: 30,
    maxAttempts: 3,
    hashing: {
      secret: "new-secret",
      previousSecrets: ["old-secret"],
    },
  });

  const verified = await rotatedManager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp as string,
  });

  assert.equal(verified, true);
});

test("supports legacy otp verification during hmac migration by default", async () => {
  const store = new MemoryAdapter();
  const legacyManager = new OTPManager({
    store,
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await legacyManager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const hardenedManager = new OTPManager({
    store,
    ttl: 30,
    maxAttempts: 3,
    hashing: {
      secret: "current-secret",
    },
  });

  const verified = await hardenedManager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp as string,
  });

  assert.equal(verified, true);
});

test("can disable legacy verification after migration", async () => {
  const store = new MemoryAdapter();
  const legacyManager = new OTPManager({
    store,
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await legacyManager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const hardenedManager = new OTPManager({
    store,
    ttl: 30,
    maxAttempts: 3,
    hashing: {
      secret: "current-secret",
      allowLegacyVerify: false,
    },
  });

  await assert.rejects(
    hardenedManager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: generated.otp as string,
    }),
    OTPInvalidError,
  );
});

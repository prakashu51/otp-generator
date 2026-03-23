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

function flushHooks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  const store = new MemoryAdapter();
  const oldManager = new OTPManager({
    store,
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
    store,
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

test("emits generated and verified hooks with metadata and normalized identifier", async () => {
  const generatedEvents: Array<Record<string, unknown>> = [];
  const verifiedEvents: Array<Record<string, unknown>> = [];

  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hooks: {
      onGenerated: async (event) => {
        generatedEvents.push(event);
      },
      onVerified: async (event) => {
        verifiedEvents.push(event);
      },
    },
  });

  const generated = await manager.generate({
    type: "email",
    identifier: " User@Example.com ",
    intent: "login",
    metadata: {
      requestId: "req_123",
    },
  });

  await flushHooks();

  await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp as string,
    metadata: {
      requestId: "req_123",
    },
  });

  await flushHooks();

  assert.equal(generatedEvents.length, 1);
  assert.equal(verifiedEvents.length, 1);
  assert.equal(generatedEvents[0].normalizedIdentifier, "user@example.com");
  assert.equal(verifiedEvents[0].normalizedIdentifier, "user@example.com");
  assert.deepEqual(generatedEvents[0].metadata, { requestId: "req_123" });
});

test("emits failed and locked hooks for invalid and exhausted verification attempts", async () => {
  const failedEvents: Array<Record<string, unknown>> = [];
  const lockedEvents: Array<Record<string, unknown>> = [];

  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 2,
    devMode: true,
    hooks: {
      onFailed: async (event) => {
        failedEvents.push(event);
      },
      onLocked: async (event) => {
        lockedEvents.push(event);
      },
    },
  });

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

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPMaxAttemptsExceededError,
  );

  await flushHooks();

  assert.equal(failedEvents.length, 1);
  assert.equal(failedEvents[0].reason, "invalid");
  assert.equal(lockedEvents.length, 1);
  assert.equal(lockedEvents[0].maxAttempts, 2);
});

test("emits cooldown and rate-limited hooks", async () => {
  const cooldownEvents: Array<Record<string, unknown>> = [];
  const rateLimitedEvents: Array<Record<string, unknown>> = [];

  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    resendCooldown: 60,
    rateLimit: {
      window: 60,
      max: 1,
    },
    devMode: true,
    hooks: {
      onCooldownBlocked: async (event) => {
        cooldownEvents.push(event);
      },
      onRateLimited: async (event) => {
        rateLimitedEvents.push(event);
      },
    },
  });

  await manager.generate({
    type: "email",
    identifier: "cooldown@example.com",
    intent: "login",
  });

  await assert.rejects(
    manager.generate({
      type: "email",
      identifier: "cooldown@example.com",
      intent: "login",
    }),
    OTPResendCooldownError,
  );

  const rateManager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    rateLimit: {
      window: 60,
      max: 1,
    },
    devMode: true,
    hooks: {
      onRateLimited: async (event) => {
        rateLimitedEvents.push(event);
      },
    },
  });

  await rateManager.generate({
    type: "email",
    identifier: "rate@example.com",
    intent: "login",
  });

  await assert.rejects(
    rateManager.generate({
      type: "email",
      identifier: "rate@example.com",
      intent: "login",
    }),
    OTPRateLimitExceededError,
  );

  await flushHooks();

  assert.equal(cooldownEvents.length, 1);
  assert.equal(cooldownEvents[0].resendCooldown, 60);
  assert.equal(rateLimitedEvents.length, 1);
  assert.equal(rateLimitedEvents[0].max, 1);
});

test("hook errors are non-blocking by default and reported to onHookError", async () => {
  const hookErrors: string[] = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hooks: {
      onGenerated: async () => {
        throw new Error("hook exploded");
      },
      onHookError: async (error) => {
        hookErrors.push((error as Error).message);
      },
    },
  });

  const generated = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  await flushHooks();

  assert.match(generated.otp ?? "", /^\d{6}$/);
  assert.deepEqual(hookErrors, ["hook exploded"]);
});

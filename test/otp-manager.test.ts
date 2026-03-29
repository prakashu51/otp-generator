import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryAdapter,
  OTPExpiredError,
  OTPInvalidError,
  OTPLockedError,
  OTPManager,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
  VerificationSecretAlreadyUsedError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
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

test("cooldown policy with identifier scope blocks different intents for same identifier", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    cooldown: {
      seconds: 30,
      scope: "identifier",
    },
    devMode: true,
  });

  await manager.generate({ type: "email", identifier: "user@example.com", intent: "login" });

  await assert.rejects(
    manager.generate({
      type: "email",
      identifier: "user@example.com",
      intent: "signup",
    }),
    OTPResendCooldownError,
  );
});

test("rate limit scope intent_channel allows different intents independently", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    rateLimit: {
      window: 60,
      max: 1,
      scope: "intent_channel",
    },
    devMode: true,
  });

  await manager.generate({ type: "email", identifier: "user@example.com", intent: "login" });
  const second = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "signup",
  });

  assert.match(second.otp ?? "", /^\d{6}$/);
});

test("lockout blocks generate and verify during lock window", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    lockout: {
      seconds: 60,
      afterAttempts: 1,
      appliesTo: "both",
    },
    devMode: true,
  });

  await manager.generate({ type: "email", identifier: "user@example.com", intent: "login" });

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPLockedError,
  );

  await assert.rejects(
    manager.generate({ type: "email", identifier: "user@example.com", intent: "login" }),
    OTPLockedError,
  );

  await assert.rejects(
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPLockedError,
  );
});

test("sliding window rate limiting requires redis adapter", async () => {
  assert.throws(
    () =>
      new OTPManager({
        store: new MemoryAdapter(),
        ttl: 30,
        maxAttempts: 3,
        rateLimit: {
          window: 60,
          max: 1,
          algorithm: "sliding_window",
        },
      }),
    TypeError,
  );
});

test("cooldown config takes precedence over legacy resendCooldown", async () => {
  const cooldownEvents: Array<Record<string, unknown>> = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    resendCooldown: 60,
    cooldown: {
      seconds: 5,
      scope: "identifier",
    },
    devMode: true,
    hooks: {
      onCooldownBlocked: async (event) => {
        cooldownEvents.push(event);
      },
    },
  });

  await manager.generate({ type: "email", identifier: "user@example.com", intent: "login" });

  await assert.rejects(
    manager.generate({ type: "email", identifier: "user@example.com", intent: "signup" }),
    OTPResendCooldownError,
  );

  await flushHooks();

  assert.equal(cooldownEvents.length, 1);
  assert.equal(cooldownEvents[0].resendCooldown, 5);
  assert.equal(cooldownEvents[0].scope, "identifier");
});

test("hook payload contract stays stable for rate limiting and lock events", async () => {
  const rateLimitedEvents: Array<Record<string, unknown>> = [];
  const lockedEvents: Array<Record<string, unknown>> = [];

  const rateManager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    rateLimit: {
      window: 60,
      max: 1,
    },
    hooks: {
      onRateLimited: async (event) => {
        rateLimitedEvents.push(event as unknown as Record<string, unknown>);
      },
    },
  });

  await rateManager.generate({ type: "email", identifier: "rate@example.com", intent: "login" });
  await assert.rejects(
    rateManager.generate({ type: "email", identifier: "rate@example.com", intent: "login" }),
    OTPRateLimitExceededError,
  );

  const lockManager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    lockout: {
      seconds: 60,
      afterAttempts: 1,
      appliesTo: "both",
    },
    hooks: {
      onLocked: async (event) => {
        lockedEvents.push(event as unknown as Record<string, unknown>);
      },
    },
  });

  await lockManager.generate({ type: "email", identifier: "lock@example.com", intent: "login" });
  await assert.rejects(
    lockManager.verify({
      type: "email",
      identifier: "lock@example.com",
      intent: "login",
      otp: "000000",
    }),
    OTPLockedError,
  );

  await flushHooks();

  assert.deepEqual(
    Object.keys(rateLimitedEvents[0]).sort(),
    ["algorithm", "credentialKind", "identifier", "intent", "max", "metadata", "normalizedIdentifier", "scope", "timestamp", "type", "window"].sort(),
  );
  assert.equal(rateLimitedEvents[0].scope, "channel");
  assert.equal(rateLimitedEvents[0].algorithm, "fixed_window");
  assert.equal(rateLimitedEvents[0].credentialKind, "otp");

  assert.deepEqual(
    Object.keys(lockedEvents[0]).sort(),
    ["appliesTo", "credentialKind", "identifier", "intent", "lockoutSeconds", "maxAttempts", "metadata", "normalizedIdentifier", "operation", "scope", "timestamp", "type"].sort(),
  );
  assert.equal(lockedEvents[0].operation, "verify");
  assert.equal(lockedEvents[0].credentialKind, "otp");
  assert.equal(lockedEvents[0].appliesTo, "both");
  assert.equal(lockedEvents[0].scope, "intent_channel");
});

test("hooks.throwOnError can intentionally fail the OTP flow", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hooks: {
      throwOnError: true,
      onGenerated: async () => {
        throw new Error("blocking hook failure");
      },
    },
  });

  await assert.rejects(
    manager.generate({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
    }),
    /blocking hook failure/,
  );
});

test("startup validation guards store adapter shape and hashing rotation conflicts", () => {
  assert.throws(
    () =>
      new OTPManager({
        store: {} as never,
        ttl: 30,
        maxAttempts: 3,
      }),
    /store.get must be a function/,
  );

  assert.throws(
    () =>
      new OTPManager({
        store: new MemoryAdapter(),
        ttl: 30,
        maxAttempts: 3,
        hashing: {
          secret: "same-secret",
          previousSecrets: ["same-secret"],
        },
      }),
    /must not include hashing.secret/,
  );
});

test("generates and verifies a token successfully", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
  });

  assert.ok(generated.token);
  assert.ok(generated.token!.length >= 32);

  const verified = await manager.verifyToken({
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
    token: generated.token as string,
  });

  assert.equal(verified, true);
});

test("token flow does not collide with OTP flow for the same identifier", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generatedOtp = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const generatedToken = await manager.generateToken({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  const otpVerified = await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generatedOtp.otp as string,
  });

  const tokenVerified = await manager.verifyToken({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    token: generatedToken.token as string,
  });

  assert.equal(otpVerified, true);
  assert.equal(tokenVerified, true);
});

test("token flow respects cooldown and rate limiting independently", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    cooldown: {
      seconds: 30,
      scope: "intent_channel",
    },
    rateLimit: {
      window: 60,
      max: 1,
    },
    devMode: true,
  });

  await manager.generateToken({
    type: "email",
    identifier: "token@example.com",
    intent: "verify-email",
  });

  await assert.rejects(
    manager.generateToken({
      type: "email",
      identifier: "token@example.com",
      intent: "verify-email",
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
  });

  await rateManager.generateToken({
    type: "email",
    identifier: "rate-token@example.com",
    intent: "verify-email",
  });

  await assert.rejects(
    rateManager.generateToken({
      type: "email",
      identifier: "rate-token@example.com",
      intent: "verify-email",
    }),
    OTPRateLimitExceededError,
  );
});

test("token verification uses the same max-attempt protection", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 2,
    devMode: true,
  });

  await manager.generateToken({
    type: "email",
    identifier: "token-lock@example.com",
    intent: "verify-email",
  });

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "token-lock@example.com",
      intent: "verify-email",
      token: "wrong-token",
    }),
    VerificationSecretInvalidError,
  );

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "token-lock@example.com",
      intent: "verify-email",
      token: "wrong-token",
    }),
    OTPMaxAttemptsExceededError,
  );
});

test("token flow returns token-specific secret errors", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 1,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
  });

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "user@example.com",
      intent: "verify-email",
      token: "wrong-token",
    }),
    VerificationSecretInvalidError,
  );

  const second = await manager.generateToken({
    type: "email",
    identifier: "user2@example.com",
    intent: "verify-email",
  });

  await new Promise((resolve) => setTimeout(resolve, 1100));

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "user2@example.com",
      intent: "verify-email",
      token: second.token as string,
    }),
    VerificationSecretExpiredError,
  );
});

test("token hooks include credentialKind token", async () => {
  const failedEvents: Array<Record<string, unknown>> = [];

  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hooks: {
      onFailed: async (event) => {
        failedEvents.push(event as unknown as Record<string, unknown>);
      },
    },
  });

  await manager.generateToken({
    type: "email",
    identifier: "token-event@example.com",
    intent: "verify-email",
  });

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "token-event@example.com",
      intent: "verify-email",
      token: "wrong-token",
    }),
    VerificationSecretInvalidError,
  );

  await flushHooks();

  assert.equal(failedEvents[0].credentialKind, "token");
});





test("generateAndSend uses deliveryAdapter for OTP payloads", async () => {
  const deliveries = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: false,
    deliveryAdapter: {
      send: async (payload) => {
        deliveries.push(payload);
      },
    },
  });

  const generated = await manager.generateAndSend({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    metadata: { requestId: "req_send_1" },
  });

  assert.equal(generated.otp, undefined);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].credentialKind, "otp");
  assert.equal(deliveries[0].type, "email");
  assert.equal(deliveries[0].identifier, "user@example.com");
  assert.equal(deliveries[0].intent, "login");
  assert.equal(typeof deliveries[0].otp, "string");
  assert.equal(deliveries[0].expiresIn, 30);
  assert.deepEqual(deliveries[0].metadata, { requestId: "req_send_1" });

  const verified = await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: deliveries[0].otp,
  });

  assert.equal(verified, true);
});

test("generateTokenAndSend uses deliveryAdapter and link helpers", async () => {
  const deliveries = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: false,
    deliveryAdapter: {
      send: async (payload) => {
        deliveries.push(payload);
      },
    },
  });

  const generated = await manager.generateTokenAndSend(
    {
      type: "email",
      identifier: "user@example.com",
      intent: "verify-email",
      metadata: { source: "email" },
    },
    {
      baseUrl: "https://app.example.com/verify-email",
      extraParams: { campaign: "welcome" },
    },
  );

  assert.equal(generated.token, undefined);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].credentialKind, "token");
  assert.equal(deliveries[0].type, "email");
  assert.equal(deliveries[0].identifier, "user@example.com");
  assert.equal(typeof deliveries[0].token, "string");
  assert.match(deliveries[0].link ?? "", /token=/);
  assert.match(deliveries[0].link ?? "", /campaign=welcome/);
  assert.deepEqual(deliveries[0].metadata, { source: "email" });

  const verified = await manager.verifyToken({
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
    token: deliveries[0].token,
  });

  assert.equal(verified, true);
});

test("generateAndSend requires deliveryAdapter", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  await assert.rejects(
    manager.generateAndSend({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
    }),
    /deliveryAdapter is required/,
  );
});

test("auditAdapter records lifecycle events", async () => {
  const auditEvents = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    auditAdapter: {
      record: async (event) => {
        auditEvents.push(event);
      },
    },
  });

  const generated = await manager.generate({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
  });

  await flushHooks();

  await manager.verify({
    type: "email",
    identifier: "user@example.com",
    intent: "login",
    otp: generated.otp,
  });

  await flushHooks();

  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0].event, "generated");
  assert.equal(auditEvents[1].event, "verified");
  assert.equal(auditEvents[0].payload.credentialKind, "otp");
});

test("startup validation guards adapter shapes", () => {
  assert.throws(
    () =>
      new OTPManager({
        store: new MemoryAdapter(),
        ttl: 30,
        maxAttempts: 3,
        auditAdapter: {} as never,
      }),
    /auditAdapter.record must be a function/,
  );

  assert.throws(
    () =>
      new OTPManager({
        store: new MemoryAdapter(),
        ttl: 30,
        maxAttempts: 3,
        deliveryAdapter: {} as never,
      }),
    /deliveryAdapter.send must be a function/,
  );
});


test("replay protection is opt-in and preserves legacy token behavior by default", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "legacy@example.com",
    intent: "verify-email",
  });

  const verified = await manager.verifyToken({
    type: "email",
    identifier: "legacy@example.com",
    intent: "verify-email",
    token: generated.token as string,
  });

  assert.equal(verified, true);

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "legacy@example.com",
      intent: "verify-email",
      token: generated.token as string,
    }),
    VerificationSecretExpiredError,
  );
});

test("replay protection returns already-used error when enabled for token flow", async () => {
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    replayProtection: {
      enabled: true,
      ttl: 60,
    },
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "used@example.com",
    intent: "verify-email",
  });

  const verified = await manager.verifyToken({
    type: "email",
    identifier: "used@example.com",
    intent: "verify-email",
    token: generated.token as string,
  });

  assert.equal(verified, true);

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "used@example.com",
      intent: "verify-email",
      token: generated.token as string,
    }),
    VerificationSecretAlreadyUsedError,
  );
});

test("replay protection emits already_used failure reason", async () => {
  const failedEvents = [];
  const manager = new OTPManager({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    replayProtection: {
      enabled: true,
      ttl: 60,
    },
    hooks: {
      onFailed: async (event) => {
        failedEvents.push(event);
      },
    },
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "hook-used@example.com",
    intent: "verify-email",
  });

  await manager.verifyToken({
    type: "email",
    identifier: "hook-used@example.com",
    intent: "verify-email",
    token: generated.token as string,
  });

  await assert.rejects(
    manager.verifyToken({
      type: "email",
      identifier: "hook-used@example.com",
      intent: "verify-email",
      token: generated.token as string,
    }),
    VerificationSecretAlreadyUsedError,
  );

  await flushHooks();

  assert.equal(failedEvents.at(-1)?.reason, "already_used");
});

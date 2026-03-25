import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "redis";

import {
  OTPExpiredError,
  OTPInvalidError,
  OTPLockedError,
  OTPManager,
  OTPRateLimitExceededError,
  RedisAdapter,
} from "../src/index.js";

const SHOULD_RUN_REDIS_TESTS = process.env.RUN_REDIS_TESTS === "1" || Boolean(process.env.REDIS_URL);
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function uniqueIdentifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function withRedisManager(
  configure: Parameters<typeof createManager>[0],
  run: (manager: OTPManager) => Promise<void>,
): Promise<void> {
  const client = createClient({ url: REDIS_URL });
  await client.connect();

  try {
    const manager = createManager(client, configure);
    await run(manager);
  } finally {
    await client.quit();
  }
}

function createManager(
  client: ReturnType<typeof createClient>,
  overrides: Partial<ConstructorParameters<typeof OTPManager>[0]> = {},
): OTPManager {
  return new OTPManager({
    store: new RedisAdapter(client as never),
    ttl: 5,
    maxAttempts: 3,
    devMode: true,
    hashing: {
      secret: "integration-secret",
    },
    ...overrides,
  });
}

test("real redis generates and verifies an OTP successfully", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({}, async (manager) => {
    const identifier = uniqueIdentifier("success");
    const generated = await manager.generate({
      type: "email",
      identifier,
      intent: "login",
    });

    const verified = await manager.verify({
      type: "email",
      identifier,
      intent: "login",
      otp: generated.otp as string,
    });

    assert.equal(verified, true);
  });
});

test("real redis expires OTPs based on TTL", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({ ttl: 1 }, async (manager) => {
    const identifier = uniqueIdentifier("expiry");
    const generated = await manager.generate({
      type: "email",
      identifier,
      intent: "login",
    });

    assert.match(generated.otp ?? "", /^\d+$/);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await assert.rejects(
      manager.verify({
        type: "email",
        identifier,
        intent: "login",
        otp: generated.otp as string,
      }),
      OTPExpiredError,
    );
  });
});

test("real redis atomic verify still prevents double-success races", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({}, async (manager) => {
    const identifier = uniqueIdentifier("race");
    const generated = await manager.generate({
      type: "email",
      identifier,
      intent: "login",
    });

    const results = await Promise.allSettled([
      manager.verify({ type: "email", identifier, intent: "login", otp: generated.otp as string }),
      manager.verify({ type: "email", identifier, intent: "login", otp: generated.otp as string }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  });
});

test("real redis rate limiting stays correct under parallel generate bursts", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({
    rateLimit: {
      window: 10,
      max: 1,
      scope: "intent_channel",
    },
  }, async (manager) => {
    const identifier = uniqueIdentifier("burst");
    const results = await Promise.allSettled([
      manager.generate({ type: "email", identifier, intent: "login" }),
      manager.generate({ type: "email", identifier, intent: "login" }),
      manager.generate({ type: "email", identifier, intent: "login" }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 2);
    for (const result of results) {
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof OTPRateLimitExceededError);
      }
    }
  });
});

test("real redis sliding-window rate limiting works", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({
    rateLimit: {
      window: 10,
      max: 1,
      scope: "intent_channel",
      algorithm: "sliding_window",
    },
  }, async (manager) => {
    const identifier = uniqueIdentifier("sliding");
    await manager.generate({ type: "email", identifier, intent: "login" });

    await assert.rejects(
      manager.generate({ type: "email", identifier, intent: "login" }),
      OTPRateLimitExceededError,
    );
  });
});

test("real redis lockout blocks abuse and recovers after the lock window", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({
    lockout: {
      seconds: 1,
      afterAttempts: 1,
      appliesTo: "both",
    },
  }, async (manager) => {
    const identifier = uniqueIdentifier("lockout");
    await manager.generate({ type: "email", identifier, intent: "login" });

    await assert.rejects(
      manager.verify({ type: "email", identifier, intent: "login", otp: "000000" }),
      OTPLockedError,
    );

    await assert.rejects(
      manager.generate({ type: "email", identifier, intent: "login" }),
      OTPLockedError,
    );

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const next = await manager.generate({ type: "email", identifier, intent: "login" });
    assert.match(next.otp ?? "", /^\d+$/);
  });
});

test("real redis max-attempt protection still returns invalid before exhaustion", { skip: !SHOULD_RUN_REDIS_TESTS }, async () => {
  await withRedisManager({}, async (manager) => {
    const identifier = uniqueIdentifier("invalid");
    await manager.generate({ type: "email", identifier, intent: "login" });

    await assert.rejects(
      manager.verify({ type: "email", identifier, intent: "login", otp: "000000" }),
      OTPInvalidError,
    );
  });
});

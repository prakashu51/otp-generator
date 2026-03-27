import test from "node:test";
import assert from "node:assert/strict";

import {
  OTPExpiredError,
  OTPLockedError,
  OTPManager,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
  RedisAdapter,
} from "../src/index.js";

interface RecordValue {
  value: string;
  expiresAt: number;
}

class FakeRedisClient {
  private readonly storage = new Map<string, RecordValue>();
  private readonly sortedWindows = new Map<string, number[]>();

  async get(key: string): Promise<string | null> {
    return this.getSync(key);
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
    this.setSync(key, value, options?.EX ?? 0);
  }

  async del(key: string): Promise<void> {
    this.storage.delete(key);
    this.sortedWindows.delete(key);
  }

  async incr(key: string): Promise<number> {
    return this.incrSync(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.expireSync(key, seconds);
  }

  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<string | null> {
    if (options.keys.length === 5) {
      return this.atomicGenerate(options);
    }

    if (options.keys.length === 3) {
      return this.atomicVerify(options);
    }

    return null;
  }

  private atomicGenerate(options: { keys: string[]; arguments: string[] }): string {
    const [otpKey, attemptsKey, rateLimitKey, cooldownKey, lockKey] = options.keys;
    const [hashedOtp, ttl, rateWindow, rateMax, resendCooldown, checkLock, algorithm, nowMs] =
      options.arguments;

    if (checkLock === "1" && this.getSync(lockKey)) {
      return "locked";
    }

    if (resendCooldown && this.getSync(cooldownKey)) {
      return "cooldown";
    }

    if (rateWindow && rateMax) {
      if (algorithm === "sliding_window") {
        const now = Number(nowMs);
        const windowStart = now - Number(rateWindow) * 1000;
        const entries = (this.sortedWindows.get(rateLimitKey) ?? []).filter((value) => value > windowStart);
        if (entries.length >= Number(rateMax)) {
          this.sortedWindows.set(rateLimitKey, entries);
          return "rate_limit";
        }
        entries.push(now);
        this.sortedWindows.set(rateLimitKey, entries);
      } else {
        const nextCount = this.incrSync(rateLimitKey);
        if (nextCount === 1) {
          this.expireSync(rateLimitKey, Number(rateWindow));
        }
        if (nextCount > Number(rateMax)) {
          return "rate_limit";
        }
      }
    }

    this.setSync(otpKey, hashedOtp, Number(ttl));
    this.storage.delete(attemptsKey);

    if (resendCooldown) {
      this.setSync(cooldownKey, "1", Number(resendCooldown));
    }

    return "ok";
  }

  private atomicVerify(options: { keys: string[]; arguments: string[] }): string {
    const [otpKey, attemptsKey, lockKey] = options.keys;
    const checkLock = options.arguments[0];
    const candidateCount = Number(options.arguments[1]);
    const candidateHashes = options.arguments.slice(2, candidateCount + 2);
    const ttl = Number(options.arguments[candidateCount + 2]);
    const maxAttempts = Number(options.arguments[candidateCount + 3]);
    const lockoutSeconds = options.arguments[candidateCount + 4];
    const lockoutAfter = options.arguments[candidateCount + 5];
    const storedHash = this.getSync(otpKey);

    if (checkLock === "1" && this.getSync(lockKey)) {
      return "locked";
    }

    if (!storedHash) {
      return "expired";
    }

    if (candidateHashes.includes(storedHash)) {
      this.storage.delete(otpKey);
      this.storage.delete(attemptsKey);
      return "verified";
    }

    const attempts = this.incrSync(attemptsKey);

    if (attempts === 1) {
      this.expireSync(attemptsKey, ttl);
    }

    if (lockoutAfter && attempts >= Number(lockoutAfter)) {
      if (lockoutSeconds) {
        this.setSync(lockKey, "1", Number(lockoutSeconds));
      }
      this.storage.delete(otpKey);
      this.storage.delete(attemptsKey);
      return "locked";
    }

    if (attempts >= maxAttempts) {
      this.storage.delete(otpKey);
      this.storage.delete(attemptsKey);
      return "max_attempts";
    }

    return "invalid";
  }

  private getSync(key: string): string | null {
    const record = this.storage.get(key);

    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      this.storage.delete(key);
      return null;
    }

    return record.value;
  }

  private setSync(key: string, value: string, ttlSeconds: number): void {
    this.storage.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER,
    });
  }

  private incrSync(key: string): number {
    const current = this.getSync(key);
    const next = (current ? Number(current) : 0) + 1;

    this.storage.set(key, {
      value: String(next),
      expiresAt: this.storage.get(key)?.expiresAt ?? Number.MAX_SAFE_INTEGER,
    });

    return next;
  }

  private expireSync(key: string, seconds: number): void {
    const current = this.storage.get(key);

    if (!current) {
      return;
    }

    this.storage.set(key, {
      value: current.value,
      expiresAt: Date.now() + seconds * 1000,
    });
  }
}

test("redis atomic verify prevents double-success race conditions", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
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

  const results = await Promise.allSettled([
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: generated.otp as string,
    }),
    manager.verify({
      type: "email",
      identifier: "user@example.com",
      intent: "login",
      otp: generated.otp as string,
    }),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].status === "rejected");
  assert.ok(rejected[0].reason instanceof OTPExpiredError);
});

test("redis atomic generate enforces resend cooldown", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
    ttl: 30,
    maxAttempts: 3,
    resendCooldown: 60,
    devMode: true,
    hashing: {
      secret: "current-secret",
    },
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

test("redis atomic generate enforces rate limits", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
    ttl: 30,
    maxAttempts: 3,
    rateLimit: {
      window: 60,
      max: 1,
    },
    devMode: true,
    hashing: {
      secret: "current-secret",
    },
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

test("redis atomic verify supports rotated secrets", async () => {
  const client = new FakeRedisClient();
  const oldManager = new OTPManager({
    store: new RedisAdapter(client),
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
    store: new RedisAdapter(client),
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

test("redis sliding window rate limiting works", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
    ttl: 30,
    maxAttempts: 3,
    rateLimit: {
      window: 60,
      max: 1,
      algorithm: "sliding_window",
    },
    devMode: true,
  });

  await manager.generate({ type: "email", identifier: "user@example.com", intent: "login" });

  await assert.rejects(
    manager.generate({ type: "email", identifier: "user@example.com", intent: "login" }),
    OTPRateLimitExceededError,
  );
});

test("redis lockout blocks subsequent generate and verify", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
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

test("redis atomic token verify prevents double-success race conditions", async () => {
  const manager = new OTPManager({
    store: new RedisAdapter(new FakeRedisClient()),
    ttl: 30,
    maxAttempts: 3,
    devMode: true,
    hashing: {
      secret: "current-secret",
    },
  });

  const generated = await manager.generateToken({
    type: "email",
    identifier: "user@example.com",
    intent: "verify-email",
  });

  const results = await Promise.allSettled([
    manager.verifyToken({
      type: "email",
      identifier: "user@example.com",
      intent: "verify-email",
      token: generated.token as string,
    }),
    manager.verifyToken({
      type: "email",
      identifier: "user@example.com",
      intent: "verify-email",
      token: generated.token as string,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

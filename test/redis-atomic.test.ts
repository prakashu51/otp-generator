import test from "node:test";
import assert from "node:assert/strict";

import {
  OTPExpiredError,
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

  async get(key: string): Promise<string | null> {
    return this.getSync(key);
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
    this.setSync(key, value, options?.EX ?? 0);
  }

  async del(key: string): Promise<void> {
    this.storage.delete(key);
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
    if (options.keys.length === 4) {
      return this.atomicGenerate(options);
    }

    if (options.keys.length === 2) {
      return this.atomicVerify(options);
    }

    return null;
  }

  private atomicGenerate(options: {
    keys: string[];
    arguments: string[];
  }): string {
    const [otpKey, attemptsKey, rateLimitKey, cooldownKey] = options.keys;
    const [hashedOtp, ttl, rateWindow, rateMax, resendCooldown] = options.arguments;

    if (resendCooldown && this.getSync(cooldownKey)) {
      return "cooldown";
    }

    if (rateWindow && rateMax) {
      const nextCount = this.incrSync(rateLimitKey);

      if (nextCount === 1) {
        this.expireSync(rateLimitKey, Number(rateWindow));
      }

      if (nextCount > Number(rateMax)) {
        return "rate_limit";
      }
    }

    this.setSync(otpKey, hashedOtp, Number(ttl));
    this.storage.delete(attemptsKey);

    if (resendCooldown) {
      this.setSync(cooldownKey, "1", Number(resendCooldown));
    }

    return "ok";
  }

  private atomicVerify(options: {
    keys: string[];
    arguments: string[];
  }): string {
    const [otpKey, attemptsKey] = options.keys;
    const [providedHash, ttl, maxAttempts] = options.arguments;
    const storedHash = this.getSync(otpKey);

    if (!storedHash) {
      return "expired";
    }

    if (storedHash === providedHash) {
      this.storage.delete(otpKey);
      this.storage.delete(attemptsKey);
      return "verified";
    }

    const attempts = this.incrSync(attemptsKey);

    if (attempts === 1) {
      this.expireSync(attemptsKey, Number(ttl));
    }

    if (attempts >= Number(maxAttempts)) {
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

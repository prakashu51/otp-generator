import type { OTPRateLimitAlgorithm, StoreAdapter } from "../core/otp.types.js";

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  eval?(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<string | number | null>;
}

export interface AtomicGenerateParams {
  otpKey: string;
  attemptsKey: string;
  rateLimitKey: string;
  cooldownKey: string;
  lockKey: string;
  hashedOtp: string;
  ttl: number;
  rateWindow?: number;
  rateMax?: number;
  rateAlgorithm?: OTPRateLimitAlgorithm;
  rateNonce?: string;
  resendCooldown?: number;
  checkLock?: boolean;
}

export interface AtomicVerifyParams {
  otpKey: string;
  attemptsKey: string;
  lockKey: string;
  usedKey?: string;
  candidateHashes: string[];
  ttl: number;
  maxAttempts: number;
  checkLock?: boolean;
  lockoutSeconds?: number;
  lockoutAfter?: number;
  replayProtectionTtl?: number;
}

export type AtomicGenerateResult = "ok" | "rate_limit" | "cooldown" | "locked";
export type AtomicVerifyResult =
  | "verified"
  | "expired"
  | "invalid"
  | "max_attempts"
  | "locked"
  | "already_used";

const ATOMIC_GENERATE_SCRIPT = `
if ARGV[6] == '1' then
  local lockExists = redis.call('GET', KEYS[5])
  if lockExists then
    return 'locked'
  end
end

if ARGV[5] ~= '' then
  local cooldownExists = redis.call('GET', KEYS[4])
  if cooldownExists then
    return 'cooldown'
  end
end

if ARGV[3] ~= '' and ARGV[4] ~= '' then
  if ARGV[7] == 'sliding_window' then
    local now = tonumber(ARGV[8])
    local windowStart = now - (tonumber(ARGV[3]) * 1000)
    redis.call('ZREMRANGEBYSCORE', KEYS[3], 0, windowStart)
    local count = redis.call('ZCARD', KEYS[3])
    if count >= tonumber(ARGV[4]) then
      return 'rate_limit'
    end
    redis.call('ZADD', KEYS[3], now, ARGV[9])
    redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))
  else
    local nextCount = redis.call('INCR', KEYS[3])
    if nextCount == 1 then
      redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))
    end
    if nextCount > tonumber(ARGV[4]) then
      return 'rate_limit'
    end
  end
end

redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('DEL', KEYS[2])

if ARGV[5] ~= '' then
  redis.call('SET', KEYS[4], '1', 'EX', tonumber(ARGV[5]))
end

return 'ok'
`;

const ATOMIC_VERIFY_SCRIPT = `
if ARGV[1] == '1' then
  local lockExists = redis.call('GET', KEYS[3])
  if lockExists then
    return 'locked'
  end
end

if ARGV[2] ~= '' and KEYS[4] ~= '' then
  local usedMarker = redis.call('GET', KEYS[4])
  if usedMarker then
    return 'already_used'
  end
end

local storedHash = redis.call('GET', KEYS[1])
if not storedHash then
  return 'expired'
end

local candidateCount = tonumber(ARGV[3])
for index = 1, candidateCount do
  if storedHash == ARGV[index + 3] then
    if ARGV[2] ~= '' and KEYS[4] ~= '' then
      redis.call('SET', KEYS[4], '1', 'EX', tonumber(ARGV[2]))
    end
    redis.call('DEL', KEYS[1])
    redis.call('DEL', KEYS[2])
    return 'verified'
  end
end

local ttlIndex = candidateCount + 4
local maxAttemptsIndex = candidateCount + 5
local lockoutSecondsIndex = candidateCount + 6
local lockoutAfterIndex = candidateCount + 7
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[ttlIndex]))
end

if ARGV[lockoutAfterIndex] ~= '' and attempts >= tonumber(ARGV[lockoutAfterIndex]) then
  if ARGV[lockoutSecondsIndex] ~= '' then
    redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[lockoutSecondsIndex]))
  end
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return 'locked'
end

if attempts >= tonumber(ARGV[maxAttemptsIndex]) then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return 'max_attempts'
end

return 'invalid'
`;

export class RedisAdapter implements StoreAdapter {
  constructor(private readonly client: RedisLikeClient) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const nextValue = await this.client.incr(key);

    if (nextValue === 1) {
      await this.client.expire(key, ttlSeconds);
    }

    return nextValue;
  }

  async generateOtpAtomically(
    params: AtomicGenerateParams,
  ): Promise<AtomicGenerateResult | null> {
    if (!this.client.eval) {
      return null;
    }

    const result = await this.client.eval(ATOMIC_GENERATE_SCRIPT, {
      keys: [
        params.otpKey,
        params.attemptsKey,
        params.rateLimitKey,
        params.cooldownKey,
        params.lockKey,
      ],
      arguments: [
        params.hashedOtp,
        String(params.ttl),
        params.rateWindow ? String(params.rateWindow) : "",
        params.rateMax ? String(params.rateMax) : "",
        params.resendCooldown ? String(params.resendCooldown) : "",
        params.checkLock ? "1" : "0",
        params.rateAlgorithm ?? "fixed_window",
        String(Date.now()),
        params.rateNonce ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ],
    });

    if (
      result === "ok" ||
      result === "rate_limit" ||
      result === "cooldown" ||
      result === "locked"
    ) {
      return result;
    }

    return null;
  }

  async verifyOtpAtomically(params: AtomicVerifyParams): Promise<AtomicVerifyResult | null> {
    if (!this.client.eval) {
      return null;
    }

    const result = await this.client.eval(ATOMIC_VERIFY_SCRIPT, {
      keys: [params.otpKey, params.attemptsKey, params.lockKey, params.usedKey ?? ""],
      arguments: [
        params.checkLock ? "1" : "0",
        params.replayProtectionTtl ? String(params.replayProtectionTtl) : "",
        String(params.candidateHashes.length),
        ...params.candidateHashes,
        String(params.ttl),
        String(params.maxAttempts),
        params.lockoutSeconds ? String(params.lockoutSeconds) : "",
        params.lockoutAfter ? String(params.lockoutAfter) : "",
      ],
    });

    if (
      result === "verified" ||
      result === "expired" ||
      result === "invalid" ||
      result === "max_attempts" ||
      result === "locked" ||
      result === "already_used"
    ) {
      return result;
    }

    return null;
  }
}

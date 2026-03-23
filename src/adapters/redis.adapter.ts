import type { StoreAdapter } from "../core/otp.types.js";

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
  hashedOtp: string;
  ttl: number;
  rateWindow?: number;
  rateMax?: number;
  resendCooldown?: number;
}

export interface AtomicVerifyParams {
  otpKey: string;
  attemptsKey: string;
  candidateHashes: string[];
  ttl: number;
  maxAttempts: number;
}

export type AtomicGenerateResult = "ok" | "rate_limit" | "cooldown";
export type AtomicVerifyResult = "verified" | "expired" | "invalid" | "max_attempts";

const ATOMIC_GENERATE_SCRIPT = `
if ARGV[5] ~= '' then
  local cooldownExists = redis.call('GET', KEYS[4])
  if cooldownExists then
    return 'cooldown'
  end
end

if ARGV[3] ~= '' and ARGV[4] ~= '' then
  local nextCount = redis.call('INCR', KEYS[3])
  if nextCount == 1 then
    redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))
  end
  if nextCount > tonumber(ARGV[4]) then
    return 'rate_limit'
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
local storedHash = redis.call('GET', KEYS[1])
if not storedHash then
  return 'expired'
end

local candidateCount = tonumber(ARGV[1])
for index = 1, candidateCount do
  if storedHash == ARGV[index + 1] then
    redis.call('DEL', KEYS[1])
    redis.call('DEL', KEYS[2])
    return 'verified'
  end
end

local ttlIndex = candidateCount + 2
local maxAttemptsIndex = candidateCount + 3
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[ttlIndex]))
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
      keys: [params.otpKey, params.attemptsKey, params.rateLimitKey, params.cooldownKey],
      arguments: [
        params.hashedOtp,
        String(params.ttl),
        params.rateWindow ? String(params.rateWindow) : "",
        params.rateMax ? String(params.rateMax) : "",
        params.resendCooldown ? String(params.resendCooldown) : "",
      ],
    });

    if (result === "ok" || result === "rate_limit" || result === "cooldown") {
      return result;
    }

    return null;
  }

  async verifyOtpAtomically(params: AtomicVerifyParams): Promise<AtomicVerifyResult | null> {
    if (!this.client.eval) {
      return null;
    }

    const result = await this.client.eval(ATOMIC_VERIFY_SCRIPT, {
      keys: [params.otpKey, params.attemptsKey],
      arguments: [
        String(params.candidateHashes.length),
        ...params.candidateHashes,
        String(params.ttl),
        String(params.maxAttempts),
      ],
    });

    if (
      result === "verified" ||
      result === "expired" ||
      result === "invalid" ||
      result === "max_attempts"
    ) {
      return result;
    }

    return null;
  }
}


import type { StoreAdapter } from "../core/otp.types.js";

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

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
}

import type { StoreAdapter } from "../core/otp.types.js";

interface MemoryRecord {
  value: string;
  expiresAt: number;
}

export class MemoryAdapter implements StoreAdapter {
  private readonly storage = new Map<string, MemoryRecord>();

  async get(key: string): Promise<string | null> {
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

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.storage.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get(key);
    const nextValue = (current ? Number(current) : 0) + 1;

    await this.set(key, String(nextValue), ttlSeconds);

    return nextValue;
  }
}

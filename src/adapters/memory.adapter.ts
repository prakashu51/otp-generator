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
    const currentRecord = this.storage.get(key);

    if (!currentRecord || currentRecord.expiresAt <= Date.now()) {
      await this.set(key, "1", ttlSeconds);
      return 1;
    }

    const nextValue = Number(currentRecord.value) + 1;

    this.storage.set(key, {
      value: String(nextValue),
      expiresAt: currentRecord.expiresAt,
    });

    return nextValue;
  }
}

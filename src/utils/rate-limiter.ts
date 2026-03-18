import type { RateLimitConfig, StoreAdapter } from "../core/otp.types.js";
import { OTPRateLimitExceededError } from "../errors/otp.errors.js";

export async function assertWithinRateLimit(
  store: StoreAdapter,
  key: string,
  config?: RateLimitConfig,
): Promise<void> {
  if (!config) {
    return;
  }

  const nextCount = await store.increment(key, config.window);

  if (nextCount > config.max) {
    throw new OTPRateLimitExceededError();
  }
}

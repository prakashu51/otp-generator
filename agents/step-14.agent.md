# Step 14 - v0.7.0 Reliability And Redis Confidence

## What changed
- Added real Redis integration tests gated by `RUN_REDIS_TESTS` / `REDIS_URL`.
- Added ESM and CommonJS smoke scripts against built package output.
- Extended CI with compatibility smoke checks on the Node version matrix.
- Added a dedicated Redis service job in CI to validate real Redis behavior.

## Why it matters
- Confirms atomic Redis logic against a live Redis server instead of only fake clients.
- Protects package exports and Nest integration from regressions.
- Improves confidence before the path to `v1.0.0`.

## Validation targets
- TTL expiry on real Redis
- Parallel verify race protection on real Redis
- Burst generate rate limiting on real Redis
- Sliding-window rate limiting on real Redis
- Lockout recovery after lock-window expiry

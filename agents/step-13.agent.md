# Step 13 - v0.6.0 Throughput And Abuse Controls

## What changed
- Added policy-based cooldown configuration with scoped keying.
- Added temporary lockout windows after repeated verification failures.
- Added scoped throttling options for identifier, intent, channel, and intent+channel.
- Added optional Redis sliding-window rate limiting for high-volume flows.
- Kept legacy `resendCooldown` and basic `rateLimit` usage backward compatible.

## Key implementation details
- Redis atomic generate now checks lock state, cooldown, and rate limit in one path.
- Redis atomic verify now checks lock state and can set a lock window after repeated failures.
- Memory adapter remains simple and supports fixed-window behavior only.
- Sliding-window mode is validated to require `RedisAdapter`.

## Validation
- `npm.cmd run build` passed.
- `npm.cmd test` passed with 28/28 tests green.
- `npm.cmd pack --dry-run` produced a clean tarball for `redis-otp-manager@0.6.0`.

# Step 16 - v0.9.0 Final API Stabilization

## What changed
- Added compatibility regression tests for config precedence and hook contract stability.
- Hardened startup validation for invalid store adapters and conflicting hashing rotation config.
- Added stable API and config precedence documentation.
- Bumped the package version to `0.9.0` without changing the public OTP flow.

## Why it matters
- Protects older integrations from accidental regressions.
- Makes the path to `v1.0.0` explicit and predictable.
- Freezes the intended public surface before the first major release.

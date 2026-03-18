# Step 02

Implemented the first secure OTP flow.

What was added:
- `OTPManager` with `generate()` and `verify()`
- secure hashing and timing-safe comparison
- key builder utilities
- rate limit utility
- Redis and memory adapters
- typed OTP errors

Why:
- to deliver the first usable package flow for Redis-backed OTP generation and verification

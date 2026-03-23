# Step 11

Implemented the v0.4.0 cryptographic hardening release.

What was added:
- keyed HMAC-based OTP storage when a secret is configured
- support for previous secrets during verification rotation
- legacy SHA-256 verification compatibility for migrations
- Redis atomic verify support for multiple candidate hashes

Why:
- to materially improve Redis-leak resistance while keeping a practical migration path for existing users

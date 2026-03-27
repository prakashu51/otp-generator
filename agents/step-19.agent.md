# Step 19 - v1.1.0 Verification Tokens And Link Flows

## What changed
- Added `generateToken()` and `verifyToken()` as additive APIs.
- Added a secure token generator for email verification and magic-link style flows.
- Reused existing hashing, Redis atomic verification, cooldown, rate limiting, and lockout behavior for token flows.
- Added separate token key namespaces to avoid collisions with existing OTP flows.
- Added docs and an example for verification-link usage.

## Why it matters
- Extends the package beyond numeric OTPs without breaking the stable OTP API.
- Makes email verification and token-link flows possible while keeping the package provider-agnostic.

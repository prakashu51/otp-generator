# Step 20 - v1.2.0 Token Error Semantics And Hook Context

## What changed
- Added `VerificationSecretExpiredError` and `VerificationSecretInvalidError` for token verification flows.
- Kept the original OTP-specific errors for existing OTP methods.
- Added additive `credentialKind` context to hook payloads so OTP and token events can be distinguished.
- Updated docs and migration notes for the new token semantics.

## Why it matters
- Makes token-based verification links feel first-class instead of OTP-shaped.
- Improves API response mapping for email verification and magic-link flows.
- Preserves backward compatibility for older OTP consumers.

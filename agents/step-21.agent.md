# Step 21

Implemented `v1.3.0` verification-link helper utilities as an additive release.

What changed:
- added `buildVerificationLink()` for safe, provider-agnostic verification-link construction
- added `buildTokenDeliveryPayload()` for delivery-ready token payload generation
- exported helper functions and types from the package root
- documented helper usage in the main README and token-link example
- added migration notes for `1.2.x -> 1.3.0`

Compatibility:
- existing `generate()` / `verify()` OTP APIs remain unchanged
- existing `generateToken()` / `verifyToken()` token APIs remain unchanged
- helpers are optional utilities layered on top of the current token flow

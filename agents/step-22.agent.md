# Step 22

Implemented `v1.4.0` audit and delivery adapter foundations.

What changed:
- added optional `auditAdapter` and `deliveryAdapter` configuration
- added explicit `generateAndSend()` and `generateTokenAndSend()` helpers
- added delivery payload helpers for OTP and token flows
- bridged lifecycle events into optional audit recording
- added tests and docs/examples for adapter usage

Compatibility:
- existing OTP and token generation and verification flows remain unchanged
- adapters are optional and provider-agnostic
- existing hooks remain available and continue to work

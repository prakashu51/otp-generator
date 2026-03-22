# Step 08

Implemented the v0.2.x hardening patch without breaking the existing API shape.

What was added:
- conservative identifier normalization before key creation
- config validation for normalization and resend cooldown
- optional resend cooldown support
- docs and tests for safer defaults

Why:
- to improve production safety and abuse resistance while keeping existing consumers compatible

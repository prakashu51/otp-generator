# Step 12

Implemented the v0.5.0 observability release.

What was added:
- lifecycle hooks for generated, verified, failed, locked, rate-limited, and cooldown-blocked events
- structured request metadata support
- non-blocking hook execution by default with optional hook error escalation
- README examples for logger integration

Why:
- to make the package much easier to audit, log, and monitor in real production environments without changing the core OTP API

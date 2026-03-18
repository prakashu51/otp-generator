# Step 07

Implemented the next release-focused package step.

What was added:
- NestJS integration through `redis-otp-manager/nest`
- `OTPModule.forRoot()` and `OTPModule.forRootAsync()`
- `InjectOTPManager()` decorator
- tag-based GitHub Actions npm publish workflow

Why:
- to make the package more useful in real backend projects and automate releases safely without publishing on every main merge

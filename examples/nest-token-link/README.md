# NestJS Verification Link Example

This example shows a simple NestJS-style flow for email verification links.

## Service

```ts
import { Injectable } from "@nestjs/common";
import {
  OTPManager,
  buildVerificationLink,
  buildVerificationResultLink,
  getVerificationOutcome,
} from "redis-otp-manager";

@Injectable()
export class EmailVerificationService {
  constructor(private readonly otp: OTPManager) {}

  async createVerificationLink(email: string) {
    const generated = await this.otp.generateToken({
      type: "email",
      identifier: email,
      intent: "verify-email",
    });

    return buildVerificationLink({
      baseUrl: "https://app.example.com/verify-email",
      token: generated.token ?? "",
      identifier: email,
      intent: "verify-email",
      type: "email",
    });
  }

  async verifyEmail(token: string, email: string) {
    const verified = await this.otp.verifyToken({
      type: "email",
      identifier: email,
      intent: "verify-email",
      token,
    });

    if (verified) {
      // update your user record here
    }

    return verified;
  }
}
```

## Controller callback example

```ts
import { Controller, Get, Query } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  constructor(private readonly emailVerification: EmailVerificationService) {}

  @Get("verify-email")
  async verifyEmail(
    @Query("token") token: string,
    @Query("identifier") identifier: string,
  ) {
    await this.emailVerification.verifyEmail(token, identifier);

    return {
      verified: true,
      redirect: buildVerificationResultLink({
        baseUrl: "https://app.example.com/verify-email/result",
        outcome: getVerificationOutcome({ verified: true }),
      }),
    };
  }
}
```


If you initialize `OTPManager` with `replayProtection`, your callback route can distinguish an already-used verification link from an expired one and map those cases to different responses if needed.


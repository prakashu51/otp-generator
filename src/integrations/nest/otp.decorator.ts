import { Inject } from "@nestjs/common";

import { OTPManager } from "../../core/otp.service.js";

export function InjectOTPManager(): ReturnType<typeof Inject> {
  return Inject(OTPManager);
}

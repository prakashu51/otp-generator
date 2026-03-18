import { randomInt } from "node:crypto";

export function generateNumericOtp(length = 6): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new TypeError("OTP length must be a positive integer.");
  }

  let otp = "";

  for (let index = 0; index < length; index += 1) {
    otp += randomInt(0, 10).toString();
  }

  return otp;
}

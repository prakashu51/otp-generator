import { createHash, timingSafeEqual } from "node:crypto";

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function verifyOtpHash(otp: string, expectedHash: string): boolean {
  const actualBuffer = Buffer.from(hashOtp(otp), "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

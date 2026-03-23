import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { OTPHashingOptions, OTPPayload } from "./otp.types.js";

const LEGACY_PREFIX = "sha256:";
const HMAC_PREFIX = "hmac-sha256:";

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function createStoredOtpHash(
  otp: string,
  payload: OTPPayload,
  hashing?: OTPHashingOptions,
): string {
  if (hashing?.secret) {
    return `${HMAC_PREFIX}${hashOtpWithSecret(otp, payload, hashing.secret)}`;
  }

  return `${LEGACY_PREFIX}${hashOtp(otp)}`;
}

export function buildVerificationHashes(
  otp: string,
  payload: OTPPayload,
  hashing?: OTPHashingOptions,
): string[] {
  const candidates = new Set<string>();

  if (hashing?.secret) {
    candidates.add(`${HMAC_PREFIX}${hashOtpWithSecret(otp, payload, hashing.secret)}`);

    for (const secret of hashing.previousSecrets ?? []) {
      candidates.add(`${HMAC_PREFIX}${hashOtpWithSecret(otp, payload, secret)}`);
    }
  }

  const allowLegacyVerify = hashing?.allowLegacyVerify ?? true;

  if (!hashing?.secret || allowLegacyVerify) {
    const legacyHash = hashOtp(otp);
    candidates.add(legacyHash);
    candidates.add(`${LEGACY_PREFIX}${legacyHash}`);
  }

  return [...candidates];
}

export function verifyOtpHash(
  otp: string,
  payload: OTPPayload,
  expectedHash: string,
  hashing?: OTPHashingOptions,
): boolean {
  const candidates = buildVerificationHashes(otp, payload, hashing);

  return candidates.some((candidate) => safeCompareHashes(candidate, expectedHash));
}

function hashOtpWithSecret(otp: string, payload: OTPPayload, secret: string): string {
  return createHmac("sha256", secret).update(buildHmacMaterial(otp, payload)).digest("hex");
}

function buildHmacMaterial(otp: string, payload: OTPPayload): string {
  return [payload.intent ?? "default", payload.type, payload.identifier, otp].join(":");
}

function safeCompareHashes(candidate: string, expectedHash: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expectedHash);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

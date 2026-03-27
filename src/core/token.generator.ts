import { randomBytes } from "node:crypto";

const BASE64_URL_PADDING = /=/g;
const BASE64_URL_PLUS = /\+/g;
const BASE64_URL_SLASH = /\//g;

export function generateSecureToken(length = 32): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new TypeError("token length must be a positive integer.");
  }

  const byteLength = Math.ceil((length * 3) / 4);
  return randomBytes(byteLength)
    .toString("base64")
    .replace(BASE64_URL_PADDING, "")
    .replace(BASE64_URL_PLUS, "-")
    .replace(BASE64_URL_SLASH, "_")
    .slice(0, length);
}

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVerificationResultLink,
  classifyVerificationError,
  getVerificationOutcome,
  OTPExpiredError,
  OTPInvalidError,
  OTPLockedError,
  OTPMaxAttemptsExceededError,
  OTPRateLimitExceededError,
  OTPResendCooldownError,
  VerificationSecretAlreadyUsedError,
  VerificationSecretExpiredError,
  VerificationSecretInvalidError,
} from "../src/index.js";

test("classifyVerificationError maps token and OTP errors into stable helper kinds", () => {
  assert.equal(classifyVerificationError(new VerificationSecretAlreadyUsedError()).kind, "already_used");
  assert.equal(classifyVerificationError(new VerificationSecretExpiredError()).kind, "expired");
  assert.equal(classifyVerificationError(new OTPExpiredError()).kind, "expired");
  assert.equal(classifyVerificationError(new VerificationSecretInvalidError()).kind, "invalid");
  assert.equal(classifyVerificationError(new OTPInvalidError()).kind, "invalid");
  assert.equal(classifyVerificationError(new OTPLockedError()).kind, "locked");
  assert.equal(classifyVerificationError(new OTPRateLimitExceededError()).kind, "rate_limited");
  assert.equal(classifyVerificationError(new OTPMaxAttemptsExceededError()).kind, "max_attempts");
  assert.equal(classifyVerificationError(new OTPResendCooldownError()).kind, "cooldown_blocked");
});

test("getVerificationOutcome resolves verified, error-based, and unknown outcomes", () => {
  assert.equal(getVerificationOutcome({ verified: true }), "verified");
  assert.equal(getVerificationOutcome({ error: new VerificationSecretAlreadyUsedError() }), "already_used");
  assert.equal(getVerificationOutcome({ error: new Error("boom") }), "unknown");
  assert.equal(getVerificationOutcome({}), "unknown");
});

test("buildVerificationResultLink builds outcome links with defaults and extra params", () => {
  const url = buildVerificationResultLink({
    baseUrl: "https://app.example.com/verify-result",
    outcome: "already_used",
    code: "VERIFICATION_SECRET_ALREADY_USED",
    extraParams: { redirect: "/login", source: "email" },
  });

  assert.equal(
    url,
    "https://app.example.com/verify-result?outcome=already_used&code=VERIFICATION_SECRET_ALREADY_USED&redirect=%2Flogin&source=email",
  );
});

test("buildVerificationResultLink supports custom param names", () => {
  const url = buildVerificationResultLink({
    baseUrl: "https://app.example.com/verify-result",
    outcome: "verified",
    code: "OK",
    paramNames: { outcome: "status", code: "reason" },
  });

  assert.equal(url, "https://app.example.com/verify-result?status=verified&reason=OK");
});

test("buildVerificationResultLink validates baseUrl", () => {
  assert.throws(() => buildVerificationResultLink({ baseUrl: "", outcome: "verified" }), TypeError);
});

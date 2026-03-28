import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOtpDeliveryPayload,
  buildTokenDeliveryPayload,
  buildVerificationLink,
} from "../src/index.js";

test("buildVerificationLink creates a URL with default params", () => {
  const link = buildVerificationLink({
    baseUrl: "https://app.example.com/verify-email",
    token: "token-123",
    identifier: "user@example.com",
    intent: "verify-email",
    type: "email",
  });

  const url = new URL(link);

  assert.equal(url.origin, "https://app.example.com");
  assert.equal(url.pathname, "/verify-email");
  assert.equal(url.searchParams.get("token"), "token-123");
  assert.equal(url.searchParams.get("identifier"), "user@example.com");
  assert.equal(url.searchParams.get("intent"), "verify-email");
  assert.equal(url.searchParams.get("type"), "email");
});

test("buildVerificationLink supports custom param names and extra params", () => {
  const link = buildVerificationLink({
    baseUrl: "https://app.example.com/magic-login",
    token: "token-123",
    identifier: "user@example.com",
    intent: "magic-login",
    paramNames: {
      token: "code",
      identifier: "email",
    },
    extraParams: {
      redirect: "/dashboard",
      remember: true,
    },
  });

  const url = new URL(link);

  assert.equal(url.searchParams.get("code"), "token-123");
  assert.equal(url.searchParams.get("email"), "user@example.com");
  assert.equal(url.searchParams.get("intent"), "magic-login");
  assert.equal(url.searchParams.get("redirect"), "/dashboard");
  assert.equal(url.searchParams.get("remember"), "true");
});

test("buildTokenDeliveryPayload returns delivery-ready token context", () => {
  const payload = buildTokenDeliveryPayload({
    baseUrl: "https://app.example.com/reset-password",
    token: "token-123",
    identifier: "user@example.com",
    intent: "reset-password",
    type: "email",
    expiresIn: 1800,
  });

  assert.equal(payload.identifier, "user@example.com");
  assert.equal(payload.intent, "reset-password");
  assert.equal(payload.type, "email");
  assert.equal(payload.token, "token-123");
  assert.equal(payload.expiresIn, 1800);
  assert.match(payload.link, /^https:\/\/app\.example\.com\/reset-password\?/);
});

test("buildVerificationLink validates required fields", () => {
  assert.throws(
    () =>
      buildVerificationLink({
        baseUrl: "",
        token: "token-123",
        identifier: "user@example.com",
      }),
    /baseUrl is required/,
  );

  assert.throws(
    () =>
      buildVerificationLink({
        baseUrl: "https://app.example.com/verify",
        token: "",
        identifier: "user@example.com",
      }),
    /token is required/,
  );
});


test("buildOtpDeliveryPayload returns delivery-ready otp context", () => {
  const payload = buildOtpDeliveryPayload({
    type: "sms",
    identifier: "+911234567890",
    intent: "login",
    otp: "123456",
    expiresIn: 300,
    metadata: { source: "sms" },
  });

  assert.equal(payload.credentialKind, "otp");
  assert.equal(payload.type, "sms");
  assert.equal(payload.identifier, "+911234567890");
  assert.equal(payload.otp, "123456");
  assert.equal(payload.expiresIn, 300);
  assert.deepEqual(payload.metadata, { source: "sms" });
});


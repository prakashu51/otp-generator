import test from "node:test";
import assert from "node:assert/strict";

import { MemoryAdapter, OTPManager } from "../src/index.js";
import { InjectOTPManager, OTPModule } from "../src/integrations/nest/index.js";

test("nestjs forRoot exposes OTPManager provider", () => {
  const moduleDefinition = OTPModule.forRoot({
    store: new MemoryAdapter(),
    ttl: 30,
    maxAttempts: 3,
    isGlobal: true,
  });

  const firstProvider = (moduleDefinition.providers ?? [])[0] as { provide?: unknown };

  assert.equal(moduleDefinition.global, true);
  assert.ok(moduleDefinition.providers);
  assert.ok(moduleDefinition.exports);
  assert.equal(firstProvider.provide, OTPManager);
});

test("nestjs decorator resolves to an injection decorator", () => {
  const decorator = InjectOTPManager();
  assert.equal(typeof decorator, "function");
});

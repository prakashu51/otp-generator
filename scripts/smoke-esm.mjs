import assert from "node:assert/strict";

const root = await import("../dist/index.js");
const nest = await import("../dist/integrations/nest/index.js");

assert.equal(typeof root.OTPManager, "function");
assert.equal(typeof root.MemoryAdapter, "function");
assert.equal(typeof root.RedisAdapter, "function");
assert.equal(typeof nest.OTPModule.forRoot, "function");
assert.equal(typeof nest.InjectOTPManager, "function");

console.log("ESM smoke checks passed");

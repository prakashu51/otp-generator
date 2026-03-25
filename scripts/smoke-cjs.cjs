const assert = require("node:assert/strict");

const root = require("../dist/cjs/index.js");
const nest = require("../dist/cjs/integrations/nest/index.js");

assert.equal(typeof root.OTPManager, "function");
assert.equal(typeof root.MemoryAdapter, "function");
assert.equal(typeof root.RedisAdapter, "function");
assert.equal(typeof nest.OTPModule.forRoot, "function");
assert.equal(typeof nest.InjectOTPManager, "function");

console.log("CJS smoke checks passed");

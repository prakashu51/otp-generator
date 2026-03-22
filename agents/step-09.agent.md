# Step 09

Fixed CommonJS compatibility for the published package.

What was added:
- dual ESM and CommonJS package exports
- dedicated CommonJS build output under `dist/cjs`
- build script to mark the CJS directory with `type: commonjs`
- docs covering ESM and CommonJS usage

Why:
- so NestJS apps running through CommonJS or `ts-node/register` can consume the package without manual patching

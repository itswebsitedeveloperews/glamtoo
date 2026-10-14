---
name: Workspace script bundling
description: Running standalone TypeScript timing/diagnostic scripts that import workspace libraries.
---

Standalone bundled scripts must include workspace-library source rather than
externalizing every package indiscriminately. Keep native/provider dependencies
external as needed, and provide Node `createRequire` when bundling CommonJS
dependencies into ESM.

**Why:** Workspace libraries expose TypeScript source with directory imports;
Node's native ESM loader cannot resolve those imports. Externalizing everything
also makes transitive dependencies resolve from the script's package rather
than their owning workspace package, where pnpm linked them.

**How to apply:** For one-off diagnostics, follow the existing service build
strategy or bundle workspace source and ordinary dependencies, externalizing
native/provider dependencies explicitly. Do not add unrelated dependencies to
the app merely to make an over-externalized script run.

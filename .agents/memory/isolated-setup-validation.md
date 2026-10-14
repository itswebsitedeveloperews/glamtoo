---
name: Isolated setup validation
description: Package-store configuration when running credential-stripped setup checks.
---

When running setup in the existing workspace with a credential-stripped child
environment, preserve the resolved pnpm package store configuration separately.

**Why:** Removing the environment's package-manager configuration can select a
different store, make pnpm recreate node_modules, and cause a short setup timeout
to measure dependency downloads instead of setup behavior.

**How to apply:** Resolve the current package store without exposing application
credentials, pass only that package-manager setting alongside the minimal
validation environment, and always use an owned disposable database. Do not
inherit application secrets merely to preserve dependency-install configuration.

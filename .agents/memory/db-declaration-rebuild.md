---
name: Database declaration rebuild
description: Composite database project references can retain stale declarations after a schema barrel changes.
---

After adding a database schema file or changing its barrel exports, run the database TypeScript build before typechecking dependent packages.

**Why:** Dependent workspace packages may resolve `lib/db/dist` declarations through composite project references, even when the linked source barrel already includes the new export.

**How to apply:** Run `pnpm --filter @workspace/db exec tsc -b`, then typecheck the API or other packages that import the new database symbol.
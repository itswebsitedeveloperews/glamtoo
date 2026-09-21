---
name: Catalog seed lifecycle
description: Prevents intentionally deleted catalog products from being restored during later Admin loads.
---

Seed built-in products only when the shared catalog is uninitialized. Once initialized, a missing built-in product represents an intentional catalog change and must remain absent.

**Why:** Restoring missing seed products on each Admin load made a successful deletion appear temporary because the deleted product returned after refresh.

**How to apply:** When evolving catalog initialization or migration logic, distinguish first-time seeding from later schema/content migrations. Never infer that a missing product should be recreated merely because it exists in the bundled seed data.
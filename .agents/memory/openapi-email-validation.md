---
name: OpenAPI Zod generation compatibility
description: Avoid mismatches between the API generator and the workspace Zod runtime.
---

Keep the API generator's target Zod major explicitly aligned with the installed runtime rather than relying on automatic detection.

**Why:** Automatic detection emitted Zod 4 helpers such as `zod.email()` and `zod.int()` against this workspace’s Zod 3 runtime, breaking generated-library typechecking. Explicitly selecting the compatible major fixed generation without changing dependencies.

**How to apply:** Preserve the explicit generation target unless upgrading the runtime deliberately, and check generated libraries after schema changes. Continue validating checkout email and quantity at the server boundary.
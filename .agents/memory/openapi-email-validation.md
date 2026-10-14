---
name: OpenAPI Zod generation compatibility
description: Avoid mismatches between the API generator and the workspace Zod runtime.
---

Keep the API generator's target Zod major explicitly aligned with the installed runtime rather than relying on automatic detection.

**Why:** Automatic detection emitted Zod 4 helpers such as `zod.email()` and `zod.int()` against this workspace’s Zod 3 runtime, breaking generated-library typechecking. Explicitly selecting the compatible major fixed generation without changing dependencies.

**How to apply:** Preserve the explicit generation target unless upgrading the runtime deliberately, and check generated libraries after schema changes. Continue validating checkout email and quantity at the server boundary.

Use named component schemas referenced by `$ref` for request bodies rather than inline body objects.

**Why:** The current generator assigns inline request-body types the same name as exported Zod body constants, which conflicts when this workspace re-exports both modules. Named models avoid that collision.

**How to apply:** When adding an endpoint, define its input in `components.schemas`, reference it from the request body, and regenerate/typecheck the shared libraries.
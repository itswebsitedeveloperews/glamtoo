---
name: OpenAPI email validation compatibility
description: Avoid a code-generation mismatch between OpenAPI email formats and the workspace Zod runtime.
---

Do not use `format: email` in this workspace’s OpenAPI schemas until its generator and Zod runtime are compatible; enforce email syntax at the server boundary instead.

**Why:** The current generator emits `zod.email()`, while the installed Zod version does not provide that API, causing generated-library typechecking to fail.

**How to apply:** Keep length constraints in the OpenAPI schema and add explicit email validation in the route before accepting the request.
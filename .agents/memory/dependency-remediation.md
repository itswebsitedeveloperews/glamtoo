---
name: Dependency remediation boundaries
description: Why glob-based proxy middleware was removed and how to assess security overrides.
---

Keep the Clerk proxy free of glob-filtering dependencies unless a real product
requirement calls for them.

**Why:** The proxy uses only a fixed Express mount. Its former middleware
introduced an unpatched brace-parser advisory for functionality the shop did
not need; using the same underlying proxy engine avoids maintaining a fork.

**How to apply:** When changing the proxy wrapper, preserve request streams,
Clerk headers, mount-prefix handling, cookies and bodyless/chunked response
framing. Verify against a local upstream rather than weakening authentication.

Security overrides that cross parent-declared version ranges need evidence from
the actual consumers, not just an empty dependency scan.

**Why:** Updating to an ESM-only UUID can break CommonJS storage clients, and
build-tool compatibility is not guaranteed by advisory metadata.

**How to apply:** Check module format, resolve dependencies through their
parents, and run the clean Linux production builds and schema-loader checks.

HTTP tests for public storefront documents must supply their own invented
Clerk publishable key and canonical-origin fixtures.

**Why:** Public SSR mounts Clerk even for signed-out pages, and sitemap indexes
require an explicit origin. Tests can pass with ambient workspace configuration
but fail in the validator's deliberately credential-stripped environment.

**How to apply:** Supply fixtures in test configuration and restore any changed
environment. Do not inherit provider credentials to make isolated checks pass.

---
name: Public storefront rendering
description: Hydration privacy boundaries, synchronous rendering and matching SSR image URLs.
---

Render the existing public React templates for everyone, not a separate crawler
view. Keep account, bag, checkout and other session-dependent routes client-only.
Browser storage must be read after public hydration, never included in its JSON.

**Why:** Public HTML must be truthful without exposing private data or showing a
different page to crawlers. The merchant's pre-launch noindex policy is unchanged
by making public content renderable.

**How to apply:** Seed both sides from the same public snapshot and preserve
post-hydration refresh behavior. Existing browser API mocks cannot affect initial
server HTML; explicitly isolate client-only fallback tests.

Judge hydration by both browser diagnostics and functioning controls, not just
visible content after JavaScript runs.

**Why:** React can replace mismatched server HTML with a client render that looks
correct. A successful screenshot or final heading alone can therefore hide a
broken hydration path.

**How to apply:** Keep the initial server snapshot intact in SSR browser checks,
capture mismatch warnings and page errors from before navigation, and require
a post-hydration interaction or browser-only state change as well.

Do not introduce an await or streaming renderer while request data is held in
storefront module state; rendering must finish synchronously and reset in finally.

**Why:** The existing client catalog was module-scoped. Async rendering would
allow concurrent document requests to use another request's catalog snapshot.

**How to apply:** Move to request-local context before changing rendering mode.

Use identical public asset URLs in client and SSR builds.

**Why:** Rollup's default emitted-file references in the SSR target were file://
URLs, even though those same images belong to the client asset directory.

**How to apply:** Check initial production HTML and srcsets, not just the
development preview, when changing image transforms or the rendering build.

Load the storefront stylesheet from the HTML document, not only from JavaScript.

**Why:** Vite's development CSS imports are injected by JavaScript. A production
CSS extraction can look correct while the no-JavaScript preview is unstyled.

**How to apply:** Preserve the HTML stylesheet link and verify no-JavaScript
presentation in development as well as linked CSS in the production document.

Rich-text sanitization must serialize identically in server and browser DOMs.

**Why:** The server DOM reversed anchor attribute order relative to the native
browser DOM. The content looked identical but React reported an innerHTML
hydration mismatch when saved return information contained links.

**How to apply:** Use deterministic allowlisted serialization; do not return a
DOM implementation's innerHTML directly as the shared sanitizer result.

Keep the production renderer self-contained, and test it outside the workspace's
dependency tree. Apply dependency bundling only to the production SSR build,
not Vite's development module loader.

**Why:** Healthy public APIs and a working development preview do not prove the
published renderer can load its dependencies. A client render can mask a 503
document. Bundling dependencies in Vite development also changes module loading
and can break otherwise valid development rendering.

**How to apply:** Verify the built renderer in a temporary directory without
node_modules, then check raw HTTP statuses, visible initial HTML and metadata
for the current public routes. Preserve real 503s for unavailable live data,
log the underlying server error, and distinguish local build verification from
verification of a republished site.

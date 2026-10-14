---
name: Performance audit comparability
description: Avoid misleading performance scores from incomplete production-build test environments.
---

Validate that the tested build loads real catalog images and the same configured services as production before comparing performance scores. Treat local Lighthouse scores as local results, never as a new live PageSpeed score.

**Why:** A temporary production-build preview initially received development-only image URLs, and its isolated authentication configuration could not render the account widget. A fast score with missing resources or omitted services is misleading.

**How to apply:** Check failed requests and visible image decoding alongside performance metrics. Use working same-origin API routing and representative public data. Verify configured account UI separately; do not change authentication behavior merely to improve an anonymous-page score. Recheck the published site after publication.

Generate optimized image derivatives without replacing existing catalog media URLs or removing their original assets.

**Why:** Saved product galleries can reference previously built asset URLs. Changing those references or deleting originals can break existing products despite a faster new homepage.

**How to apply:** Optimize presentation, keep originals available for saved galleries and full-resolution views, and do not reseed or rewrite catalog data as a performance fix.

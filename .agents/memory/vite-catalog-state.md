---
name: Vite catalog state
description: How to verify fresh seed data when the browser-backed catalog changes during development.
---

When changing a localStorage-backed catalog’s seed data or storage key, verify the result after a full restart in a fresh browser context.

**Why:** Vite fast refresh can preserve an existing React state value across edits. A state effect may then write that older in-memory catalog into a newly changed storage key, making development previews look like the seed migration failed.

**How to apply:** Treat a hot-reloaded admin session as potentially stale after catalog-seed changes. Restart the workflow and open a new browser context before deciding whether the seeded products or image mappings are wrong.
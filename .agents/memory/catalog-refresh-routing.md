---
name: Catalog refresh routing
description: Preserve admin workspace state when catalog updates trigger storefront refreshes.
---

Keep mounted routes stable when catalog data refreshes, both in the admin and on the storefront. Refresh their data without resetting active workspace sections or unsaved customer selections/drafts.

**Why:** Publishing a product dispatches a catalog update. Remounting resets the admin section to Overview; focus/background refreshes must also avoid discarding a customer's in-progress product or checkout state.

**How to apply:** Any future change to catalog refresh behavior should verify that create, update, remove, and category actions do not remount the active admin workspace.
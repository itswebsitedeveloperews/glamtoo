---
name: Catalog refresh routing
description: Preserve admin workspace state when catalog updates trigger storefront refreshes.
---

Keep the admin route on a stable React key when the catalog media version changes; storefront routes may still use the version to refresh catalog-backed views.

**Why:** Publishing a product dispatches the catalog update event. Keying the whole route switch to that version remounts the admin dashboard and resets its local section state to Overview.

**How to apply:** Any future change to catalog refresh behavior should verify that create, update, remove, and category actions do not remount the active admin workspace.
---
name: Admin image persistence
description: Preserve admin-created products by keeping browser-stored image payloads compact.
---

Product images selected in the admin must be resized and compressed before they are saved with catalog data. Product persistence should fail visibly rather than silently when browser storage is unavailable.

**Why:** Raw file-to-data-URL uploads can exceed browser localStorage capacity. The editor can show the in-memory product immediately, but it disappears after a reload and its storefront route cannot resolve.

**How to apply:** Keep uploads compact before adding them to product state, retain the existing localStorage catalog key for normal persistence, and surface a clear admin notice if a write still fails.
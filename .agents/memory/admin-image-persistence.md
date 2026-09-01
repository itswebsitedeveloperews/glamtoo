---
name: Admin image persistence
description: Keep catalog media durable and migrate browser-backed galleries safely.
---

Uploaded media must not be embedded in catalog metadata. Publish immutable App Storage object references only after the image upload succeeds, preserve their order through gallery edits, and leave entered product details intact when upload or shared-catalog saving fails.

Legacy browser catalog records may contain v3/v4 product data and IndexedDB-backed image references. Migrate those data sources only from an authorized admin session: resolve the original bytes, upload them first, then save the shared catalog after every reference is durable.

**Why:** Raw file-to-data-URL uploads can exceed browser storage and are not visible to shoppers or other administrators. A partial migration that saves metadata before media loses gallery content after reload.

**How to apply:** Preserve each media reference independently from its gallery position, keep the editor open until persistence succeeds, migrate both supported legacy catalog formats before marking their migration complete, and display object references through the storage-serving URL rather than a browser-only fallback.
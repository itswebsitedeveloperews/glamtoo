---
name: Admin image persistence
description: Keep gallery uploads reliable when browser storage is constrained.
---

Uploaded media must not be embedded in catalog metadata. Its reference must be immutable through gallery edits, and a failed save must leave the entered product intact.

**Why:** Raw file-to-data-URL uploads can exceed localStorage capacity. A failed all-in-one write can make a newly entered product disappear after reload, especially with several gallery views.

**How to apply:** Preserve each media reference independently from its gallery position, keep the editor open until persistence succeeds, and reload media from the underlying catalog references rather than a display fallback.
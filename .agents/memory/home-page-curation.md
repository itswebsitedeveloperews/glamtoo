---
name: Home page curation semantics
description: Distinguishes unsaved homepage defaults from an admin's intentionally empty selections.
---

An unset home-page configuration should show the existing catalog-derived defaults, but saved empty selections must remain empty. Never repopulate a cleared section automatically.

**Why:** Admins need to be able to remove a homepage section deliberately without a later catalog refresh silently bringing it back.

**How to apply:** When changing home-page defaults or catalog refreshes, distinguish absent settings from a saved configuration; ignore IDs for products or categories that no longer exist rather than substituting unrelated items.
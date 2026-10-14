---
name: Home page curation semantics
description: Homepage curation semantics and merchant's mobile collection-copy presentation request.
---

An unset home-page configuration should show the existing catalog-derived defaults, but saved empty selections must remain empty. Never repopulate a cleared section automatically.

**Why:** Admins need to be able to remove a homepage section deliberately without a later catalog refresh silently bringing it back.

**How to apply:** When changing home-page defaults or catalog refreshes, distinguish absent settings from a saved configuration; ignore IDs for products or categories that no longer exist rather than substituting unrelated items.

## Mobile collection copy

Keep the text area inside homepage collection tiles wider on phones, while
preserving tablet and desktop presentation.

**Why:** The merchant requested increasing the mobile text width, highlighting
wrapped collection headings and “Shop” links in an iPhone reference.

**How to apply:** Widen the collection text area only at phone sizes; do not
change card widths, font sizes, or the approved tablet two-column layouts.

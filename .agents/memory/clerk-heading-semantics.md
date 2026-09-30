---
name: Clerk heading semantics
description: Semantic heading hierarchy for embedded Clerk sign-in in the storefront.
---

The embedded Clerk sign-in title is rendered as an h1. Appearance styling can change how it looks, but not its HTML tag. If a page already has a primary h1, provide a real h2 for the initial sign-in title while keeping Clerk's changing instructions available on later sign-in steps.

**Why:** Hiding or replacing the generated heading throughout the whole flow can erase useful instructions. CSS that targets Clerk's internal DOM triggers its structural-CSS warning and may break when Clerk updates its UI.

**How to apply:** Prefer a supported semantic customization if one becomes available. If a DOM-dependent workaround is unavoidable, pin the Clerk UI version as recommended and check both the initial screen and subsequent authentication steps.
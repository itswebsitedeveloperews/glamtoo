---
name: Clerk heading semantics
description: Semantic heading hierarchy for embedded Clerk sign-in in the storefront.
---

The embedded Clerk sign-in/sign-up title is rendered as an h1. Keep that actual heading as the auth page's sole primary heading. Supporting welcome/registration copy should be styled introductory text, not another h1.

**Why:** Visually hiding Clerk's h1 and overlaying an h2 does not remove the original heading from the DOM. The user reported duplicate H1s; retaining Clerk's own heading also preserves instructions during later auth steps.

**How to apply:** Do not hide SDK headings or replace their DOM nodes. Remove the fake-title overlay and structural selectors. Verify rendered sign-in and registration screens, not just source JSX.
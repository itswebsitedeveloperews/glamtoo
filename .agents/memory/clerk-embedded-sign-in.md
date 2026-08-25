---
name: Clerk embedded sign-in
description: Auth UI behavior observed when integrating managed Clerk with the Glam Me Vite/Wouter storefront.
---

Use Clerk’s default embedded sign-in/sign-up mode for the protected admin gate in this Vite application. Do not pass `routing="virtual"`—this Clerk version models embedded mode by omitting the `routing` prop.

**Why:** The path-routed Clerk components rendered an empty, zero-size placeholder even after adding Wouter navigation callbacks. The default embedded components rendered normally. The explicit `"virtual"` value also fails type checking in the installed Clerk type definitions.

**How to apply:** Keep `/admin` owned by the application router and render the embedded Clerk component when the user is signed out. Re-test the real `/admin` route after any Clerk, React, or routing change.
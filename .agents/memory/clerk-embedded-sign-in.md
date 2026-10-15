---
name: Clerk embedded sign-in
description: Auth UI behavior observed when integrating managed Clerk with the Glam Me Vite/Wouter storefront.
---

Use Clerk’s default embedded sign-in/sign-up mode for the protected admin gate in this Vite application. Do not pass `routing="virtual"`—this Clerk version models embedded mode by omitting the `routing` prop.

**Why:** The path-routed Clerk components rendered an empty, zero-size placeholder even after adding Wouter navigation callbacks. The default embedded components rendered normally. The explicit `"virtual"` value also fails type checking in the installed Clerk type definitions.

**How to apply:** Keep `/admin` owned by the application router and render the embedded Clerk component when the user is signed out. Re-test the real `/admin` route after any Clerk, React, or routing change.

Prefer the existing customer account sign-in page for review sign-in, preserving a local return URL to the product.

**Why:** In a real signed-out browser check, opening Clerk's sign-in modal from the review panel produced no visible UI. Navigation to the embedded account form rendered the sign-in interface.

**How to apply:** Do not replace that entry with a modal without checking the actual signed-out flow. The customer form initially shows email and Continue; a hidden password input in the DOM is not evidence that both fields should be visible on that first step.
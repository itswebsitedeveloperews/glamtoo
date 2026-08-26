---
name: Stripe connector setup
description: How Glam Too should surface Stripe connection readiness without exposing credentials.
---

An attached Stripe workspace connection is not necessarily payment-ready: the server must confirm a usable Stripe secret key before creating Checkout Sessions. Keep the API running when that key is absent, return a visible configuration status, and block checkout with an explicit message.

**Why:** The connection can be present while credential settings are incomplete. Crashing the API hides the actionable setup problem and breaks unrelated services; placing keys in browser storage would expose payment credentials.

**How to apply:** Keep publishable/secret keys out of the storefront and localStorage. Show connection, configured, and test/live status in Admin → Payments. Create or update Stripe credentials only through the secure workspace connection, then refresh the status and enable hosted checkout only after server validation succeeds. Checkout amounts must come from server-recognized catalog data; browser-only admin products need a server catalog sync before payment can be enabled for them.
---
name: Stripe key management UI
description: Security boundary and UX pattern for Stripe credentials in this app.
---

Stripe secret, publishable, and webhook credentials must remain in the Replit-managed secure connection. The admin app should show masked/configured status, safe setup guidance, refresh verification, and links to Stripe’s test/live key pages instead of collecting or storing key values.

**Why:** The attached Stripe connection is the source of truth for server credentials, and an app-level key form would either expose secrets to the browser or require unsafe persistence. Missing connection credentials are intentionally surfaced as a visible setup state.

**How to apply:** When extending Payments, keep credential changes outside localStorage and browser state. Add admin controls around status and connection guidance, and treat the 503 status response for missing secret configuration as an expected setup condition rather than a checkout code failure.
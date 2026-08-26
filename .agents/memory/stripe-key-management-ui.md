---
name: Stripe key management UI
description: Security boundary and UX pattern for admin-managed Stripe credentials.
---

The protected admin Payments form is an alternative source for Stripe credentials. It sends values directly to the API, which validates a newly supplied secret key and encrypts credential values at rest in the project database. Saved values are never returned to the browser, rendered in the admin UI, or written to local storage.

**Why:** The creator requested to manage Stripe keys inside the admin app instead of through environment configuration. Server-side encryption with the existing session secret preserves that workflow without creating browser-visible credentials.

**How to apply:** Keep all credential mutation behind the admin authorization middleware. Never echo, log, or persist plaintext key values in the frontend; input state must be cleared after save. The manual encrypted settings take priority over a Replit Stripe connection, and saving calls Stripe setup to refresh the managed webhook and sync.
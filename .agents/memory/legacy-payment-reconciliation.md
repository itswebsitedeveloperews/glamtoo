---
name: Legacy payment reconciliation
description: Stable pagination rules for importing historical Stripe orders.
---

Reconcile historical Checkout Sessions with a stable `(created, id)` keyset cursor rather than a numeric offset, and retain support for previously saved numeric cursors during the transition. Traverse the nullable timestamp tail separately.

**Why:** The Stripe sync source can receive newer rows between reconciliation pages. Offset pagination shifts under those inserts, which can skip historical paid orders; timestamp ties and nullable legacy fields also need deterministic progress.

**How to apply:** Use descending `created` and `id` ordering, persist the final row as the next cursor, and include `created IS NULL` only after timestamped rows. Continue Stripe PaymentIntent list pages with the provider’s `starting_after` cursor until `has_more` is false.
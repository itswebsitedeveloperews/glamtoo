---
name: UK shipping rules
description: Historical UK delivery defaults versus current admin-configured rates.
---

The original UK defaults were standard £3.95 below £75, free from £75, and express £6.95. These are historical defaults, not a standing override of admin-configured shipping methods. Preserve current configured prices and thresholds when fixing cart/checkout inconsistencies.

**Why:** After configurable shipping was introduced, the cart retained the old defaults while checkout used updated settings. Restoring old rates would overwrite the merchant's configuration rather than fix the inconsistency.

**How to apply:** Use enabled server-provided shipping settings throughout cart and checkout. Determine eligibility from the pre-discount item subtotal in integer pennies; the server remains authoritative for the Stripe amount.
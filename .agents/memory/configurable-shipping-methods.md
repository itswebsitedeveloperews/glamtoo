---
name: Configurable shipping methods
description: Rules for keeping admin-managed delivery options and checkout payment totals consistent.
---

Shipping methods are database-managed records with a name, checkout description, price, optional free-over threshold, enabled state, and display order. Checkout must load enabled methods rather than carry its own rate definitions.

**Why:** Shipping affects coupon quotes, Stripe totals, and saved orders. Trusting a browser-supplied amount or silently falling back to hard-coded rates can charge a different total from the option shown to the customer.

**How to apply:** Send only the selected method identifier from the browser. Resolve the enabled method and calculate its delivery amount on the server for coupon validation and every payment path. Preserve the resolved method name on the order.
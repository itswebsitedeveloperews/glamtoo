---
name: VAT-inclusive pricing
description: The agreed UK VAT treatment for Glam Too checkout and order records.
---

Glam Too charges standard 20% UK VAT as already included in product and delivery prices. Show the VAT component separately, but do not add it to the customer’s displayed or charged total.

**Why:** The creator selected VAT-inclusive pricing to preserve all existing GBP prices while making the tax amount transparent.

**How to apply:** Calculate the VAT component after discounts from the VAT-inclusive gross total: gross × 20 ÷ 120 (one sixth), rounded to the nearest penny. Persist the resulting amount with the order and send the unchanged gross total to Stripe.
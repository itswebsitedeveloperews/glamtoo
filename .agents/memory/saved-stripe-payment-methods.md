---
name: Saved Stripe payment methods
description: The frontend distinction between saved-card and new-card checkout in Glam Too.
---

When a saved Stripe payment method is selected, confirm the server-created PaymentIntent with the Stripe client and the saved payment-method ID. A mounted Card Element is only needed for the new-card path.

**Why:** Hiding the Card Element for saved cards while still requiring its ref causes a false “card fields are still loading” error after the PaymentIntent has already been created.

**How to apply:** Keep Stripe.js client initialization independent from Card Element mounting, and choose the saved payment-method ID or new-card Element at confirmation time.
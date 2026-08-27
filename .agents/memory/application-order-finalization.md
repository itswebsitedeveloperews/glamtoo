---
name: Application order finalization
description: Durable order, inventory, and coupon settlement rules for Stripe checkout.
---

Create a pending application-owned order before creating any Stripe PaymentIntent or Checkout Session, include its stable ID in Stripe metadata, and use the same idempotent finalizer for browser return handling and webhooks.

**Why:** Stripe objects and sync tables are payment-provider records, not a complete application order ledger. Either callback path can arrive first or repeat, so only a transactionally serialized application order can prevent duplicate orders, stock mutation, and coupon redemption.

**How to apply:** Keep payment reference attachment, paid settlement, inventory reservation deletion, and coupon redemption in the single order-finalization transaction. Verify Stripe status and authenticated ownership at browser-facing routes. Recover expired pending orders by checking Stripe before cancelling them, and migrate historical Stripe payments only when the Glam Too metadata marker is present.
---
name: Application order finalization
description: Durable order, inventory, and coupon settlement rules for Stripe checkout.
---

Create a pending application-owned order before creating any Stripe PaymentIntent or Checkout Session, include its stable ID in Stripe metadata, and use the same idempotent finalizer for browser return handling and webhooks. Expired orders must also be recoverable if Stripe failed before returning a payment reference; cancel those locally without inventing one.

**Why:** Stripe objects and sync tables are payment-provider records, not a complete application order ledger. Either callback path can arrive first or repeat, so only a transactionally serialized application order can prevent duplicate orders, stock mutation, and coupon redemption. A fabricated reference would block a delayed successful webhook from attaching the real Stripe ID.

**How to apply:** Keep payment reference attachment, paid settlement, inventory reservation deletion, and coupon redemption in the single order-finalization transaction. Verify Stripe status and ownership by the authenticated account or private guest browser session at browser-facing routes; an email or payment reference is not proof of ownership. Recover every expired pending order; check Stripe before cancelling referenced payments, and leave an unreferenced cancellation nullable. If a verified paid result arrives after cancellation, only restore it when inventory and coupon capacity can be atomically reclaimed; otherwise leave cancellation intact with an explicit failure. Migrate historical Stripe payments only when the Glam Too metadata marker is present.

Confirmation receipts must use the saved purchase snapshot, not current catalog prices or delivery settings. Optional amounts that were not supplied must remain absent rather than appear as zero. Account provisioning is separate from purchase confirmation; unresolved or refunded payments must not show the normal fulfilment receipt.

**Why:** The bag is cleared after finalization, and catalog or shipping settings can change after purchase. Recalculating from them would misrepresent what the customer actually paid.

**How to apply:** Keep confirmation redesigns presentation-only, preserve server-owned finalization and ownership checks, and do not claim email delivery or dispatch without evidence.
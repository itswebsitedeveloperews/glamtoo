---
name: Coupon payment allocations
description: Coupon capacity, pending-payment recovery, and Stripe lifecycle requirements.
---

Coupon capacity is allocated to a specific pending payment before that payment is handed to the customer. The allocation must stay in place until the payment succeeds or Stripe confirms a terminal cancellation/Checkout expiry; a declined card attempt alone is retryable and must not release it.

**Why:** Releasing an allocation for a retryable PaymentIntent can allow another shopper to take the final coupon slot while the original discounted payment is still capable of succeeding, producing a paid but unaccounted discount.

**How to apply:** Keep allocation creation, usage-cap changes, and redemption accounting under the coupon row lock. Persist pending coupon payment references in the browser so a customer can cancel/recover a failed attempt before beginning another one. Clear that stored reference only for its matching confirmed payment.
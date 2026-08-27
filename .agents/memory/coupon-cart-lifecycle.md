---
name: Coupon cart lifecycle
description: The checkout preference rule for coupons when Glam Too cart contents change.
---

An applied coupon is valid only for the current bag. Remove its saved checkout preference when the bag is emptied or an order is successfully completed, but keep it during payment retries so an interrupted checkout can resume.

**Why:** Reapplying a coupon to a later, newly built bag can unexpectedly discount unrelated items and makes the checkout state look like it added something back.

**How to apply:** Clear the coupon preference alongside cart clearing and the last-item removal; do not clear it when a payment fails and the cart remains available for retry.
---
name: Delivery content and checkout shipping
description: Distinguishes global product-page delivery copy from checkout shipping methods.
---

The Admin Delivery section manages a global informational table displayed on product detail pages. It must remain separate from checkout Shipping methods, which determine available checkout choices, rates, thresholds, and order totals.

**Why:** The merchant needs flexible product-page delivery messaging without accidentally changing what customers are charged at checkout.

**How to apply:** Product-page Delivery changes should only affect display content. Any pricing or checkout behavior change belongs in Shipping and must continue through server-side shipping resolution.
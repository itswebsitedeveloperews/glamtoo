---
name: Stripe regional Search API
description: Stripe Search API calls are unavailable for the attached account region, while standard list APIs work.
---

Do not use Stripe Search API methods for customer or product lookup in this project; use the corresponding list APIs and filter the returned metadata instead.

**Why:** Stripe returned a regional availability error for `customers.search`, which blocked saved-payment-method lookup and PaymentIntent creation.

**How to apply:** Keep customer and product matching metadata-based, but retrieve the relevant collection through Stripe list endpoints rather than Search API endpoints.
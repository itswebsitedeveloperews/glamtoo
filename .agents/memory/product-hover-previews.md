---
name: Product hover previews
description: Merchant's rule for alternate photos on product listings
---

All browsing product listings should preview the second image from the same
ordered gallery used by the product-detail slider on hover. Do not substitute
an unrelated photo or a variation image.

**Why:** The merchant explicitly requested the Pink Boutique-style second-photo
hover across listings, including category pages, Our Current Obsessions and
related products.

**How to apply:** Keep preview ordering aligned with detail-gallery ordering.
Products without a second image keep their primary photo. Preserve ordinary
tap navigation on touch-only devices rather than turning taps into hover previews.

Keep uploaded preview derivatives presentation-only and opt-in for listing
alternates. Never save reduced preview URLs back into catalog galleries.

**Why:** The merchant requires existing immutable media references, gallery
ordering, and full-resolution detail zoom to survive performance optimizations.

**How to apply:** Preserve originals, authorize derivatives against the source
image, and version derivative URLs when changing their encoding policy so
long-lived browser caches do not retain an obsolete preview.

For browser assertions, visibility alone does not prove a preview is displayed:
Playwright treats opacity-zero images as visible. Check settled computed opacity
and loaded pixels, and compare image geometry in the same frame after scale
animations settle.

**Why:** The listing's opacity fade and existing image-scale animation finish at
different times; sequential geometry samples can report a false mismatch.

**How to apply:** Use condition-based polling rather than fixed animation sleeps
when testing the primary/alternate overlay.

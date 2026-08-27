---
name: Bestseller ranking
description: The business meaning and fallback behavior for Glam Too’s Bestseller sort.
---

“Bestsellers” means products ranked by the total quantity in paid application orders. Current inventory is not a sales signal. Products with no recorded sales remain in the catalogue and use a deterministic alphabetical tie-breaker.

**Why:** A stock-based sort can label products as bestsellers merely because they have low availability, which misrepresents customer demand.

**How to apply:** Aggregate paid order-line quantities by product ID in the API and use that response for storefront sorting. Do not fall back to stock when sales data is unavailable.
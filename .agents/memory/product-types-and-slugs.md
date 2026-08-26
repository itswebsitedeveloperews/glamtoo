---
name: Product types and slugs
description: Catalog rules for Simple versus Variable products and storefront product URLs.
---

Simple products are purchasable directly and must not render size, colour, or other variation controls. Variable products render only the size and colour values defined by their in-stock variations, and the selected variation determines the cart line and price.

Each product has a title-derived slug that can be edited in the admin. Storefront links use the slug; numeric product URLs remain valid as a backward-compatible fallback.

**Why:** The storefront previously showed hard-coded variation UI for every product, which contradicted the selected product type and could not represent variation-level prices accurately.

**How to apply:** When changing catalog, cart, or detail-page behavior, keep Simple and Variable flows separate. While a selection is incomplete, disable values that cannot combine with the current choice; once a pair is complete, keep both selectors editable, clear a selection when it becomes invalid, and only enable Add to bag for an exact in-stock match. Generate a slug from the product name until an editor supplies a custom slug, and maintain slug uniqueness when saving.
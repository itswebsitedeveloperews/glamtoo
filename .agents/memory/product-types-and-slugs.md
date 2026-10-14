---
name: Product types and slugs
description: Catalog rules for Simple versus Variable products and storefront product URLs.
---

Simple products are purchasable directly and must not render size, colour, or other variation controls. Variable products render only the size and colour values defined by their in-stock variations, and the selected variation determines the cart line and price.

The absence of variations does not mean “one size.” Missing description, fit/sizing or care information must be reviewed by the owner, not generated or written automatically.

**Why:** The merchant's launch-review scope explicitly forbids inferring product facts from the catalog structure or historical audit.

**How to apply:** Keep direct Simple purchases available while flagging missing information nonblockingly in admin. Only display sizing or care facts supplied by the owner.

Each product has a title-derived slug that can be edited in the admin. Storefront links use the slug; numeric product URLs remain valid as a backward-compatible fallback.

**Why:** The storefront previously showed hard-coded variation UI for every product, which contradicted the selected product type and could not represent variation-level prices accurately.

**How to apply:** When changing catalog, cart, or detail-page behavior, keep Simple and Variable flows separate. While a selection is incomplete, disable values that cannot combine with the current choice; once a pair is complete, keep both selectors editable, clear a selection when it becomes invalid, and only enable Add to bag for an exact in-stock match. Generate a slug from the product name until an editor supplies a custom slug, and maintain slug uniqueness when saving.

Variable-product advertised prices must describe purchasable, in-stock variants, not the parent administrative price. Show one price when available variants agree and a range when they differ; an out-of-stock variant must not lower the advertised starting price.

**Why:** The merchant reported a lower parent/listing price than either purchasable size and requested accurate available-variant pricing.

**How to apply:** Keep listing, unselected detail, search, wishlist, price sorting, and filters consistent with this rule. Selecting a complete variant shows its exact price. Do not change merchant-entered catalog prices just to repair display logic.
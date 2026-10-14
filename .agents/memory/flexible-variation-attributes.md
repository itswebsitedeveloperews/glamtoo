---
name: Flexible variation attributes
description: Compatibility rules for product-specific variation attributes and combinations.
---

Variable products define an ordered list of attributes before variation combinations are added. Size, Colour, and custom names are supported, and each admin row or storefront selector must render only the selected definitions.

**Why:** Products may need one attribute, several attributes, or custom attributes. Assuming every product has both Size and Colour creates irrelevant fields and incorrect customer choices.

Products sold only as One Size are simple products, not variable products.

**Why:** A single One Size option gives the customer no meaningful choice and adds an unnecessary selector.

**How to apply:** Keep legacy size and colour values for compatibility, store custom values with each variation, preserve attribute order through the API, and use the variation ID as the inventory identity. For One Size-only products, store stock on the simple product and allow direct Add to Bag.

Show product-detail size option labels in uppercase, for example S/M and M/L,
without changing their saved values or other attribute labels.

**Why:** The merchant explicitly requested uppercase size options.

**How to apply:** Format the displayed size label only; keep variation matching
and stock selection based on the original option value.
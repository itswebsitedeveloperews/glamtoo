---
name: Flexible variation attributes
description: Compatibility rules for product-specific variation attributes and combinations.
---

Variable products define an ordered list of attributes before variation combinations are added. Size, Colour, and custom names are supported, and each admin row or storefront selector must render only the selected definitions.

**Why:** Products may need one attribute, several attributes, or custom attributes. Assuming every product has both Size and Colour creates irrelevant fields and incorrect customer choices.

**How to apply:** Keep legacy size and colour values for compatibility, store custom values with each variation, preserve attribute order through the API, and use the variation ID as the inventory identity.
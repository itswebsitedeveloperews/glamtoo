---
name: Approved accent shade
description: Merchant's exact accent choice and the contrast tradeoff to preserve during accessibility work
---

The merchant requested replacing the previous deep pink with exactly `#c96381` throughout Glam Too.

Action buttons, including the product-card “Shop Now” buttons, must use `#e23d6f` as their default background and `#c93260` on hover. This supersedes the earlier button palette; non-button accents remain unchanged.

**Why:** Explicit visual direction from the merchant, not an accidental palette change.

**How to apply:** Preserve these button backgrounds when doing unrelated accessibility fixes. Use #111111 ink on default buttons (4.61:1) and white on hover buttons (5.11:1); neither one foreground passes on both shades. Keep non-button #c96381 accents, using dark ink for normal-size text on pink and light surfaces. Do not darken the approved backgrounds or resize copy to evade contrast checks. Keep ordinary/supporting copy at 16px/14px and keyboard focus visible on light, pink, and dark surfaces. Do not alter payment, auth, or order logic for color work.

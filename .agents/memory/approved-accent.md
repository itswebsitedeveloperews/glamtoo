---
name: Approved accent shade
description: Merchant's exact accent choice and the contrast tradeoff to preserve during accessibility work
---

The merchant requested replacing the previous deep pink with exactly `#c96381` throughout Glam Too.

Action buttons, including the product-card “Shop Now” buttons, must use `#e23d6f` as their default background and `#c93260` on hover. This supersedes the earlier button palette; non-button accents remain unchanged.

**Why:** Explicit visual direction from the merchant, not an accidental palette change.

**How to apply:** Preserve these button backgrounds when doing unrelated accessibility fixes. White text on the default button shade measures approximately 4.09:1, below the 4.5:1 normal-text requirement, so correct foreground treatment or obtain approval for a different shade rather than silently darkening the approved colors.

---
name: Approved accent shade
description: Merchant's exact accent choice and the contrast tradeoff to preserve during accessibility work
---

The merchant requested replacing the previous deep pink with exactly `#c96381` throughout Glam Too.

Action buttons, including the product-card “Shop Now” buttons, must use `#e23d6f` as their default background and `#c93260` on hover. This supersedes the earlier button palette; non-button accents remain unchanged.

Exclude account dashboard shortcut cards and Google sign-in buttons from the pink action-button palette. Restore and preserve their original neutral styling.

**Why these exceptions:** The merchant explicitly corrected the broad button-color change and asked for these cards and Google login buttons not to be colored.

**Why:** Explicit visual direction from the merchant, not an accidental palette change.

**How to apply:** The merchant explicitly requested `#fff` text on pink action buttons, including Shop Now and Shop the Collection, in default and hover states. Preserve that direction rather than silently restoring dark button text. White on the default pink measures approximately 4.09:1, below normal-text AA; white on the hover pink measures 5.11:1. Do not claim the default combination passes AA or weaken contrast checks. Keep Google sign-in and account dashboard shortcut cards neutral. Keep non-button #c96381 accents, using dark ink for normal-size text on pink and light surfaces. Do not darken the approved backgrounds or resize copy to evade contrast checks. Keep ordinary/supporting copy at 16px/14px and keyboard focus visible on light, pink, and dark surfaces. Do not alter payment, auth, or order logic for color work.

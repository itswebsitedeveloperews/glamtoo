---
name: Approved accent shade
description: Merchant's explicit accent and button choices to preserve during accessibility work
---

The merchant requested replacing the previous deep pink with exactly `#c96381` throughout Glam Too.

Action buttons, including the product-card “Shop Now” buttons, must use `#e23d6f` as their default background and `#c93260` on hover. This supersedes the earlier button palette; non-button accents remain unchanged.

The bag-count badge number must be `#fff`; keep its existing pink background. The merchant explicitly requested this exception to dark accent text.

Exclude account dashboard shortcut cards and Google sign-in buttons from the pink action-button palette. Restore and preserve their original neutral styling.

Google sign-in should match the merchant's reference: a white rectangular button with dark text, the standard Google logo, and a subtle neutral border/shadow. Preserve the provider's conditional “Last used” indicator rather than showing it for everyone.

**Why these exceptions:** The merchant explicitly corrected the broad button-color change and asked for these cards and Google login buttons not to be colored.

**Why:** Explicit visual direction from the merchant, not an accidental palette change.

**How to apply:** The merchant explicitly requested `#fff` text on pink action buttons, including Shop Now and Shop the Collection, in default and hover states. Preserve that direction rather than silently restoring dark button text. Measure actual contrast; do not claim a combination passes AA without evidence or weaken contrast checks. Keep Google sign-in and account dashboard shortcut cards neutral. Keep non-button #c96381 accents, using dark ink for normal-size text on pink and light surfaces. Do not darken the approved backgrounds or resize copy to evade contrast checks. Keep keyboard focus visible on light, pink, and dark surfaces.

For color-only work, do not alter payment, authentication, or order logic.

**Why:** The merchant's color-work scope excludes those behaviors.

**How to apply:** Keep behavior changes separate unless the assigned work explicitly includes them.

Photo-overlay accessibility must be verified against rendered images, bright crops,
and failed-image states on desktop and mobile, not inferred from solid swatches.

**Why:** The user explicitly distinguished promotional photo contrast from generic
public-page layout/hydration checks; responsive crops can move light fabric or sky
under text even when the original image looks safe.

**How to apply:** Preserve the merchant's images and palette. Use overlays or
text backplates to protect copy, and verify the composited pixels behind text
without counting text shadows as the contrast solution.

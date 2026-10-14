---
name: Approved accent shade
description: Merchant's explicit accent and button choices to preserve during accessibility work
---

The merchant requested replacing the previous deep pink with exactly `#c96381` throughout Glam Too.

Action buttons, including the product-card “Shop Now” buttons, must use `#e23d6f` as their default background and `#c93260` on hover. This supersedes the earlier button palette; non-button accents remain unchanged.

On wishlist cards, place View Product and Add to Cart side by side. Add to Cart
is an exception to the filled default: white background with pink text and
border. View Product stays filled pink; Remove stays below the action row.

**Why:** The merchant explicitly requested same-line buttons and supplied an
outlined Add to Cart reference.

**How to apply:** Preserve this wishlist-only treatment for both simple and
variable products without changing their existing cart or option-selection behavior.

Bag-count and wishlist-count badge numbers must be `#fff`; keep their existing pink backgrounds. The merchant explicitly requested these exceptions to dark accent text.

Product wishlist hearts must be white on hover, while pressed, and when saved,
on their existing pink backgrounds.

**Why:** The merchant explicitly requested white hearts in hover and active states.

**How to apply:** Keep unselected hearts dark on their neutral backgrounds and
preserve the wishlist toggle behavior. Do not apply this to the header menu icon.

Checkout step badge numbers (Billing, Shipping and Payment) must also be white
on their existing pink backgrounds.

Admin payment-guide number badges and completed order/checklist markers must
also have white text on their filled pink backgrounds. Keep outlined markers
dark on white.

**Why:** The merchant reiterated that all text in this kind of pink badge must
be white, supplying the admin payment-guide badges as the reference.

**How to apply:** Treat filled badge text as an exception to generic dark accent
text rules; preserve backgrounds and the distinction between filled and outlined states.

**Why:** The merchant explicitly requested white numbers in the checkout steps.

**How to apply:** Preserve this exception when applying generic accent-text rules;
keep backgrounds and checkout behavior unchanged.

Active admin navigation items should match the action buttons: `#e23d6f` with
white text, and `#c93260` on hover.

**Why:** The merchant explicitly requested the active menu color to match buttons.

**How to apply:** Limit this treatment to the active admin menu item, not neutral
account shortcut cards or public navigation.

The homepage “Shop by moment” eyebrow and “Outfits for Every Plan” heading must
be white on the existing pink background.

**Why:** The merchant supplied a reference and explicitly requested this treatment.

**How to apply:** Preserve this exception to dark accent text without changing
the section background or other homepage styling.

Exclude account dashboard shortcut cards and Google sign-in buttons from the pink action-button palette. Restore and preserve their original neutral styling.

Google sign-in should match the merchant's reference: a white rectangular button with dark text, the standard Google logo, and a subtle neutral border/shadow. Preserve the provider's conditional “Last used” indicator rather than showing it for everyone.

**Why these exceptions:** The merchant explicitly corrected the broad button-color change and asked for these cards and Google login buttons not to be colored.

**Why:** Explicit visual direction from the merchant, not an accidental palette change.

**How to apply:** The merchant explicitly requested `#fff` text on pink action buttons, including Shop Now and Shop the Collection, in default and hover states. Preserve that direction rather than silently restoring dark button text. Measure actual contrast; do not claim a combination passes AA without evidence or weaken contrast checks. Keep Google sign-in and account dashboard shortcut cards neutral. Keep non-button #c96381 accents, using dark ink for normal-size text on pink and light surfaces. Do not darken the approved backgrounds or resize copy to evade contrast checks. Keep keyboard focus visible on light, pink, and dark surfaces.

For color-only work, do not alter payment, authentication, or order logic.

Header and footer menu links should turn the button pink (`#e23d6f`) on hover;
keep their normal colors unchanged.

**Why:** The merchant explicitly requested matching pink hover text for both menus.

**How to apply:** Use the action-button color rather than the softer non-button
accent. Keep keyboard focus visible and apply the same text color on focus.

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

On the homepage, preserve the original lighter banner overlay and unboxed
collection and moment-card copy instead of the darker overlay/backplate treatment.

**Why:** The merchant explicitly requested restoring those homepage color changes.

**How to apply:** Do not silently reintroduce dark copy boxes or a blanket dark
homepage banner for accessibility work. Keep contrast tests honest and report
photo-dependent contrast limitations. This restoration does not apply to About
or FAQ, nor to the approved button colors.

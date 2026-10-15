---
name: Glam Too Boutique wordmark
description: User's intended composition and typography for the site logo.
---

Use the approved soft-serif option 1 (Cormorant Garamond) as the website logo, with dark “Glam Too” above pink “BOUTIQUE” and pink horizontal rules. Preserve the approved vector letterforms rather than recreating them with browser fonts. On dark surfaces, use light upper lettering and retain the pink details.

**Why:** The user selected option 1 from five softer-font variations, superseding the previously uploaded logo.

**How to apply:** Keep storefront, sign-in, footer, and Admin branding aligned to this selection. Keep dark-surface treatments transparent, without a white rectangle.

Keep the main desktop and mobile navigation typographically aligned with the logo, without extending this change to body copy or forms.

**Why:** The user found the DM Sans menu clashed with the softer logo and approved Cormorant Garamond Medium for navigation only.

Keep the header wordmark prominent without making the header excessively tall or crowding navigation and utility controls. Preserve the original vector proportions and homepage link.

**Why:** The merchant explicitly requested a visibly larger, stronger header logo while preserving its boutique identity and all existing header functionality.

**How to apply:** Balance logo size with available space across mobile, tablet, desktop and the compact scrolled header; do not stretch, crop or replace the approved artwork.

Use a restrained GT monogram for small brand-icon roles; keep the full wordmark primary. Avoid crowns, sparkles, shopping bags, hearts and unrelated stock symbols.

**Why:** The merchant requested an identity-derived premium boutique icon without competing with the main logo.

**How to apply:** Preserve the SVG source for sharp rendering. Hide decorative embedded instances from screen readers; give meaningful instances accessible text.

Use an email-safe PNG derived from the approved vector wordmark for contact
notifications, embedded with a CID rather than served from a new public URL.

**Why:** Email clients commonly reject SVG images; embedding avoids broken logo
links when preview emails use assets that have not yet been published.

**How to apply:** When the approved logo changes, refresh its email raster as
well. Do not recreate its lettering with a generic email-client font.

Do not assume `Uint8Array.fromBase64` is available just because Node is recent.

**Why:** Esbuild's default binary loader emitted that helper, but the workspace's
Node 24 runtime did not implement it.

**How to apply:** Decode embedded email rasters with Node's `Buffer` using a
base64 asset loader, or explicitly target and verify a compatible runtime.
---
name: Cart storage
description: Keep cart persistence small enough for browser storage and derive display data at render time.
---

Persist only a product ID, selected size, and quantity for each cart line. Resolve the product name, price, image, and display positioning from the storefront catalog when the cart renders.

**Why:** Product images can be data URLs after admin uploads. Saving image snapshots in cart localStorage can exceed the browser quota and prevent Add to bag from completing.

**How to apply:** Do not add media payloads or full product objects to cart persistence. If localStorage is unavailable or full, preserve the immediate add-to-cart flow with a compact URL fallback.

## Cart sidebar interaction

The merchant requested a bottom-right cart icon that opens a sidebar, and a
smooth automatic opening when a product is added to the cart.

**Why:** The user asked for a cart preview without leaving the current shopping
page, rather than the previous immediate navigation to the full bag.

**How to apply:** Keep automatic opening tied to successful additions, not
quantity changes, removals or restoring a saved cart. Preserve the full bag and
its storage-failure fallback. The supplied reference is visual inspiration,
not authorization to introduce parcel-protection fees, unsupported wallets or
delivery countdown promises.

Cart-sidebar item and recommendation photos must use top-aligned cropping,
regardless of a product's stored positioning.

**Why:** The merchant explicitly requested `object-position: top` for the
sidebar product photos so their upper portions remain visible.

**How to apply:** Apply this presentation override only inside the cart sidebar;
do not change saved catalog positioning or image crops elsewhere.
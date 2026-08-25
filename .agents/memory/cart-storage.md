---
name: Cart storage
description: Keep cart persistence small enough for browser storage and derive display data at render time.
---

Persist only a product ID, selected size, and quantity for each cart line. Resolve the product name, price, image, and display positioning from the storefront catalog when the cart renders.

**Why:** Product images can be data URLs after admin uploads. Saving image snapshots in cart localStorage can exceed the browser quota and prevent Add to bag from completing.

**How to apply:** Do not add media payloads or full product objects to cart persistence. If localStorage is unavailable or full, preserve the immediate add-to-cart flow with a compact URL fallback.
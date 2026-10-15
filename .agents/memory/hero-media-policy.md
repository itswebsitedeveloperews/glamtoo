---
name: Hero media and lifecycle
description: Approved homepage migration and shared media publication safety.
---

Migrate the existing approved hero once into database-managed slides, then respect intentionally empty configurations. Do not restore slides simply because every slide was deleted or disabled.

**Why:** The merchant requested editing and enabled states, not an automatic replacement of deliberate admin choices.

Hero media is shared with the product/media library. Enabling a slide may publish its object references, but deleting or disabling a slide must not delete files or revoke shared public image permissions.

**Why:** Other products or slides may still use those same images.

**How to apply:** Change slide records rather than shared assets when hiding or removing promotions. Test empty-state initialization and anonymous image access separately.

---
name: Form focus treatment
description: Merchant's preference for focused form fields without an outer outline
---

Do not add an outer focus outline around editable form fields. Use the field's existing border or an inset highlight so keyboard focus remains visible.

**Why:** The merchant explicitly asked to remove the double outer outline shown around the contact form's focused name field.

**How to apply:** Keep the replacement focus highlight inside the field. Preserve keyboard focus indicators for buttons, links, checkboxes and other controls; do not solve this by disabling every focus indicator.

Product option dropdowns must have no CSS shadow or focus outline; retain an
existing-border color change for focus instead of an inset shadow.

**Why:** The merchant separately requested removing the dropdown shadow and
outline using a product size-selector reference.

**How to apply:** Preserve this narrower product-dropdown exception when updating
shared field focus styles. Do not alter option selection behavior or other controls.

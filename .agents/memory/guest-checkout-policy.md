---
name: Guest checkout and optional registration
description: Merchant approval for guest checkout and secure ownership/registration decisions.
---

Glam Too permits guest checkout. Registration is optional, offered through “Create an account?” in Billing Details; it must not silently become a payment requirement.

**Why:** The merchant explicitly approved guest checkout after reporting the misleading optional-sign-in notice alongside a mandatory-sign-in payment gate.

**How to apply:** Preserve guest payment and confirmation when editing checkout. When “Create an account?” is checked, automatically create the account from billing details after a successful purchase, without requiring a separate signup form. Account access still requires proof of email ownership. Do not associate a guest order with an existing account merely because billing emails match.

**Why this registration behavior:** The merchant explicitly requested automatic account creation from Billing Details on purchase, rather than the separate registration step previously offered by the checkbox.

Guest order access uses private browser proof of ownership, not an email or payment reference alone. Guest checkout must not retrieve account-saved cards or grant consent to save new cards.

**Why:** Email matching or a known payment reference would expose another shopper’s order or payment methods. Creating an account must not automatically authenticate a shopper who supplied an unverified billing email.

**How to apply:** Keep payment ownership checks on finalization and cancellation as well as payment creation. Guests on another device need a separate secure recovery flow, not an authentication bypass.

Keep temporary registration billing drafts until successful payment or expiry; do not consume them on the first checkout mount.

**Why:** Checkout can initialize more than once while catalog/auth state loads. Clearing the draft at initialization caused billing details to disappear during a registration return.

**How to apply:** Preserve edits across registration returns and repeated initialization, expire unused drafts promptly, and never persist card details or passwords in them.

---
name: CSP provider boundaries
description: Attribute third-party iframe violations before changing the storefront policy.
---

Keep the owning document's origin and violation disposition when investigating
CSP. A warning from a Stripe-controlled iframe is not evidence that the storefront
parent policy needs a broader script, style or connection allowance.
Likewise, observing a nested vendor frame does not mean its origin must be added
to the parent: the approved direct Stripe frame controls its own nested documents.

**Why:** Earlier CSP monitoring captured Stripe-related style warnings without
document attribution; that evidence could not establish a storefront defect.
Clerk/Stripe compatibility needs vendor requirements and actual parent-document
evidence, not blanket wildcard permissions to silence console messages.

**How to apply:** Collect effective directive, blocked origin, document origin and
enforce/report disposition without retaining customer data or query strings.
Distinguish a production-policy check from development-only Vite exceptions, and
never describe card-frame mounting as completed payment or 3DS verification.

---
name: Product review policy
description: Moderation, public identity and submission safety for Glam Too reviews.
---

Reviews are pending until an administrator approves them. Only approved reviews contribute to public ratings, counts and listings; rejecting or unapproving must remove those contributions.

**Why:** The merchant explicitly required moderation and approved-only averages, not an automatically published review feed.

**How to apply:** Keep moderation separate from submission. Never seed fabricated customer reviews or label a reviewer as a verified purchaser without purchase evidence.

Allow guest submissions as well as signed-in shoppers. Use a public display name, taking only the account first name or username when available. Do not collect reviewer email for moderation or expose account identifiers.

**Why:** This implementation deliberately avoids adding a sign-in barrier or collecting private contact data that the requested moderation flow does not need.

**How to apply:** If moderation later needs contact details, revisit consent and access restrictions explicitly rather than deriving public names from email addresses.

Preserve a submission's retry identity after an uncertain response and acknowledge success only after persistent storage; duplicate protection must remain effective across server processes.

**Why:** A lost response or repeated click must not create a second review or clear an unsaved draft.

**How to apply:** Keep client draft recovery product-specific; do not optimistically publish a pending review after submission.

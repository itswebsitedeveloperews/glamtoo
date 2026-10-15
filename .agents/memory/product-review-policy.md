---
name: Product review policy
description: Moderation, public identity and submission safety for Glam Too reviews.
---

New and edited reviews are pending until an administrator approves them. Only approved reviews with a qualifying purchase contribute to public ratings, counts and listings; rejecting, editing or losing purchase eligibility must remove those contributions.

**Why:** The merchant explicitly required moderation and approved-only averages, not an automatically published review feed.

**How to apply:** Keep moderation separate from submission. Never seed fabricated customer reviews or label a reviewer as a verified purchaser without purchase evidence.

Only signed-in customers who purchased the parent product may submit or edit a review; everyone may read approved reviews. Require server-side order ownership by authenticated customer ID, never an email match, product name, browser flag or guest cookie. Paid orders qualify; pending, unpaid, failed, cancelled or fully refunded orders do not. A variant purchase qualifies for the parent product.

**Why:** The merchant explicitly corrected the original guest-submission policy and required verified purchasers only.

**How to apply:** Keep one review per customer per product, offering Edit your review rather than another submission. Recheck eligibility when saving and when displaying Verified Purchase publicly. Preserve old anonymous reviews privately, without claiming they are verified or matching them to customers by name/email.

Use a public display name, taking only the account first name or username when available. Do not collect reviewer email for moderation, expose account identifiers or return order details with reviews.

**Why:** The merchant requires private customer and order information to stay private.

**How to apply:** Keep purchase evidence server-side; return only eligibility and the customer's own review to that authenticated customer.

Preserve a submission's retry identity after an uncertain response and acknowledge success only after persistent storage; duplicate protection must remain effective across server processes.

**Why:** A lost response or repeated click must not create a second review or clear an unsaved draft.

**How to apply:** Scope draft recovery to account, product and review revision; prevent stale edits overwriting newer ones. Do not optimistically publish a pending review after submission.

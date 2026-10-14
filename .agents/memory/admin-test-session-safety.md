---
name: Read-only admin test sessions
description: Safely authenticate an existing admin for checks that prohibit identity or application-data changes.
---

Do not assume the generic Clerk testing helper can reuse an existing administrator without creating or updating that user. Its available documentation and exposed wrapper did not establish that guarantee.

**Why:** Read-only verification explicitly prohibited changing users, roles, verification or identities. A configured bootstrap email is not proof that a matching verified Clerk user exists, nor permission to impersonate it.

**How to apply:** Obtain explicit approval for the existing configured administrator. Look up that existing user and verify its existing authorization without modifying it. Use Clerk's existing-user sign-in-token API with a short expiry, not the ambiguous generic helper. Never create a substitute user or grant privileges. Track and revoke only the newly created test session; leave preexisting sessions alone. Keep tickets private and verify consumption, revocation or expiry. Normal sign-in timestamps may change; compare identity, email verification and metadata separately.

Read-only admin browser checks must also account for incidental writes outside the panel being checked.

**Why:** Loading the dashboard can initiate catalog migration, and listing orders can initiate legacy payment reconciliation even though the list request is GET.

**How to apply:** Block application mutation requests in the browser before navigation. Confirm reconciliation is complete before allowing the order-list request; otherwise supply a read-only snapshot of existing saved orders for navigation and disclose the substitution. Keep the status endpoint itself unmocked for live integration evidence. Do not restart the normal API merely to test: its startup can change Stripe webhooks, backfill payments and start email workers.

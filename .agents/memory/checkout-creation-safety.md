---
name: Checkout creation uncertainty
description: Preserve allocations and provider identity when checkout creation responses are lost.
---

Treat a lost payment-creation response as potentially payable, not as a failed checkout. Retain its stable retry identity, exact provider payload, account/mode, stock and coupon capacity until the provider proves a terminal outcome.

**Why:** A provider may successfully create a payment before its response is lost. Releasing capacity or retrying with a new key can create duplicate payments or let someone else consume still-payable allocations. Stripe's guaranteed key-retention window is finite.

**How to apply:** Keep retries and scheduled recovery on the same owner-scoped attempt. After the guaranteed retention window, locate the payment through paginated metadata lookup rather than blindly recreating it. A webhook can finalize before the browser receives a payment reference, so settlement must also recognize the order-owned pre-provider allocations.

Do not hold all normal query-pool connections as session locks while the locked work itself waits for database access.

**Why:** Concurrent creators can occupy the entire pool, each waiting for an additional connection to prepare its order, causing a self-deadlock even with correct advisory locking.

**How to apply:** Keep checkout session locks separate from normal queries, and separate nested customer-identity locking as well. Failed lock cleanup must discard the connection.

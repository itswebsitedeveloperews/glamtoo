---
name: Order email rollout safety
description: Why connecting transactional email must not silently enable historical or unrestricted sends.
---

Keep provider setup and unrestricted customer-email rollout separate. Do not automatically backfill confirmations for old paid orders.

**Why:** The merchant requested controlled staging verification only and prohibited emails to real customers or automatic historical resends. Connecting credentials can otherwise activate existing refund jobs as well as purchase emails.

**How to apply:** Preserve recipient restrictions during setup and testing. Get explicit approval before enabling unrestricted customer delivery or a historical resend. Actual provider-delivery or controlled-inbox evidence is required before reporting end-to-end success; simulated responses and API acceptance are not that evidence.

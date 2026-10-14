---
name: Order email rollout safety
description: Why connecting transactional email must not silently enable historical or unrestricted sends.
---

Keep provider setup and unrestricted customer-email rollout separate. Do not automatically backfill confirmations for old paid orders.

**Why:** The merchant requested controlled staging verification only and prohibited emails to real customers or automatic historical resends. Connecting credentials can otherwise activate existing refund jobs as well as purchase emails.

**How to apply:** Preserve recipient restrictions during setup and testing. Get explicit approval before enabling unrestricted customer delivery or a historical resend. Actual provider-delivery or controlled-inbox evidence is required before reporting end-to-end success; simulated responses and API acceptance are not that evidence.

The merchant approved Gmail SMTP for order confirmations, replacing the proposed MailerSend setup for that purpose.

**Why:** The user explicitly chose “Switch to Gmail SMTP.”

**How to apply:** Keep order-confirmation work on Gmail SMTP unless the merchant changes that decision. Do not treat this approval as permission to migrate other email types or enable unrestricted sending.

Use the merchant's Google OAuth application credentials with an interactive mailbox-authorization step, not as an SMTP password.

**Why:** The merchant repeatedly supplied Client ID, Client Secret and sender email instead of an App Password or manually obtained refresh token. They confirmed that the admin consent flow saved authorization and passed SMTP authentication with their own Google client.

**How to apply:** Keep a one-time admin “Connect Gmail” consent step that obtains the refresh token securely. Do not silently switch to the API-based Gmail connector, ask for credentials in chat, or claim that application credentials alone prove mailbox authorization.

Prefer avoiding duplicate messages over automatically retrying ambiguous SMTP outcomes.

**Why:** An SMTP server may accept DATA before its acknowledgement is lost. Nodemailer can label post-DATA socket errors as `CONN`, so that label alone does not establish a safe pre-send failure.

**How to apply:** Retry explicit temporary rejections or failures proven to precede message submission. Reconcile uncertain sends with the recorded Message-ID before permitting another attempt.

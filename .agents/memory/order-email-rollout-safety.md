---
name: Order email rollout safety
description: Why connecting transactional email must not silently enable historical or unrestricted sends.
---

## Approved contact-alert scope

The merchant requested contact-form email alerts and admin-side enquiry display, then requested multiple admin emails for both contact and order confirmations. If no emails are added, use the admin email.

**Why:** The merchant asked for these notification types after confirming Gmail authorization worked.

**How to apply:** Keep separate lists for contact alerts and admin order copies; blank lists fall back to the verified account email of the administrator saving the settings. Keep explicit enable controls. Admin copies are independently approved staff notifications, not permission to remove customer-order recipient restrictions. Do not alter login permissions, public contact details, or add customer replies or historical resends.

Track each admin recipient independently so a failed address cannot cause an already accepted message to be resent to another.

**Why:** Multiple recipients can have different SMTP outcomes; a single aggregate retry would duplicate successful copies.

**How to apply:** Preserve recipient snapshots and ambiguous-outcome safety when modifying notification workers or merging their changes. Recipient-setting edits apply to future messages, not historical backfill.

## Order email rollout

Keep provider setup and unrestricted customer-email rollout separate. Do not automatically backfill confirmations for old paid orders.

**Why:** The merchant requested controlled staging verification only and prohibited emails to real customers or automatic historical resends. Connecting credentials can otherwise activate existing refund jobs as well as purchase emails.

**How to apply:** Preserve recipient restrictions during setup and testing. Get explicit approval before enabling unrestricted customer delivery or a historical resend. Actual provider-delivery or controlled-inbox evidence is required before reporting end-to-end success; simulated responses and API acceptance are not that evidence.

Checking or refreshing an order's email flow must not send or retry messages.
Keep customer confirmations and admin copies separate, and distinguish
provider acceptance from confirmed delivery.

**Why:** The merchant reported a paid order without received email; payment,
queued notifications, missing admin copies and inbox delivery are different
facts, and confusing them can lead to duplicate sends.

**How to apply:** Show recorded events and current blocking conditions without
requeueing jobs or bypassing recipient and historical-send restrictions.

The merchant approved Gmail SMTP for order confirmations, replacing the proposed MailerSend setup for that purpose.

**Why:** The user explicitly chose “Switch to Gmail SMTP.”

**How to apply:** Keep order-confirmation work on Gmail SMTP unless the merchant changes that decision. Do not treat this approval as permission to migrate other email types or enable unrestricted sending.

Use the merchant's Google OAuth application credentials with an interactive mailbox-authorization step, not as an SMTP password.

**Why:** The merchant repeatedly supplied Client ID, Client Secret and sender email instead of an App Password or manually obtained refresh token. They confirmed that the admin consent flow saved authorization and passed SMTP authentication with their own Google client.

**How to apply:** Keep a one-time admin “Connect Gmail” consent step that obtains the refresh token securely. Do not silently switch to the API-based Gmail connector, ask for credentials in chat, or claim that application credentials alone prove mailbox authorization.

Prefer avoiding duplicate messages over automatically retrying ambiguous SMTP outcomes.

**Why:** An SMTP server may accept DATA before its acknowledgement is lost. Nodemailer can label post-DATA socket errors as `CONN`, so that label alone does not establish a safe pre-send failure.

**How to apply:** Retry explicit temporary rejections or failures proven to precede message submission. Reconcile uncertain sends with the recorded Message-ID before permitting another attempt.


## Matching inbox evidence

Receipt verification must match the specific approved test's saved Message-ID,
recipient, Reply-To, and complete content. A merchant's explicit Inbox-location
confirmation plus the matching original email is acceptable; copied message text
or an original for a different test is not.

**Why:** Earlier synthetic enquiries can have similar subjects and were supplied
as evidence for a different send. Accepting them would falsely prove delivery to
the approved inbox.

**How to apply:** Use one unique synthetic marker, inspect only the provided
matching original, and retain sanitized comparison results rather than copying
personal addresses or full transport headers into the verification report.
Do not resend an accepted test just because its receipt evidence is missing.

Exclude raw receipt uploads from source control before requesting them.
Removing files from the final tree or adding ignore rules afterward does not
remove earlier committed copies.

**Why:** Automatic checkpoints can capture uploaded mail originals and screenshots
before a final sanitized evidence report is prepared.

**How to apply:** Establish private-evidence exclusions before collecting originals,
record only sanitized comparisons, and inspect the task's complete history rather
than just its final diff. If raw evidence was committed, coordinate approved
history cleanup; do not claim it has been purged based on a clean working tree.

Checkpoint-managed auxiliary references can reintroduce older ancestry after a
local rewrite, even while the outgoing task branch stays clean.

**Why:** A later checkpoint restored an agent reference containing pre-cleanup
history after local branch filtering had removed the raw evidence paths.

**How to apply:** Check the outgoing task commit range independently of auxiliary
references, and explicitly distinguish sanitized delivery from global data
erasure. Do not promise removal from platform-managed retained copies.

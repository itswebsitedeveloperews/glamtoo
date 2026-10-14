# Contact alert delivery verification

## Final result — verified on 2026-10-14

**The single approved synthetic enquiry was received in the approved admin
Gmail Inbox.** The merchant confirmed its Inbox location, and the matching
original email corroborates receipt, the recipient, Reply-To, Message-ID, and
complete enquiry content. This result supersedes the earlier blocked checks
preserved below.

**Evidence handling:** Completion review identified raw uploads in earlier
versions of the task history. With merchant approval, the outgoing task history
was rewritten to exclude those files, not merely delete them from its final tree.
The outgoing changes contain only this sanitized report, verification guidance,
and exclusion rules. Platform checkpoint references can retain older ancestry,
and deletion from retained shared copies, old Git objects, or platform-managed
backups has not been established or claimed. This limitation is separate from
the verified email receipt and the cleaned outgoing task commits.

| Check | Evidence |
| --- | --- |
| Single new enquiry | Production has exactly one row for `QA-CONTACT-20261014-1109`, enquiry `4`, created at 11:09:51 UTC. |
| SMTP acceptance | The enquiry reached `accepted`; this alone was not treated as delivery proof. |
| Actual receipt | Merchant confirmed Inbox location. Original email includes the approved `Delivered-To` and receiving-server timestamps ending at 11:10:15 UTC. |
| Approved recipient only | Original `To` is exactly the approved Gmail address; `Delivered-To` matches. The production recipient snapshot contains one recipient object with that address. No Cc/Bcc headers are present. Addresses are intentionally redacted here. |
| Customer Reply-To | Original `Reply-To` is exactly the synthetic `contact-verification@example.invalid`; no customer was involved. |
| Identity | Original subject and enquiry header identify enquiry `4`. Received Message-ID exactly matches the value persisted before sending. |
| Complete content | MIME-decoded plain-text and HTML bodies both exactly match the expected name, email, order reference, topic, and entire multiline message below. Ampersand and literal angle-bracket text are safely escaped in HTML. |
| No duplicate test | One POST was made and production contains one matching enquiry. No resend or historical replay was performed. |

Verified Message-ID:
`<glam-too-contact-6e8f73ac-52eb-4251-8aab-2995db4c2cc6@notifications.glamtoo.invalid>`

The merchant-supplied original was parsed locally using Python's standard-library
email parser. All ten assertions passed: subject, enquiry header, Message-ID,
single approved To, approved Delivered-To, synthetic Reply-To, exact plain-text
body, exact escaped HTML body, absent Cc/Bcc, and no MIME defects.
SHA-256 of the inspected original:
`9fa5eb1d925b38b4974529cc566fd399ff8a09585aa0c55e1c963b3628cdd266`.

No raw transport headers, personal addresses, mailbox credentials, or unrelated
message content are embedded in this report. No mailbox login or mailbox API
access was used: only merchant-provided test files were inspected. The merchant
configured the protected contact-alert settings; this verification did not change
admin login permissions, order-email settings, or customer recipient restrictions,
and did not send a customer email. Earlier uploads for enquiry `3` were explicitly
rejected as evidence for this test.

The application status remains `accepted`: manual receipt evidence does not
justify changing the provider status to a general delivery guarantee. Only this
single test is proven; future delivery, continued Gmail authorization, and other
recipients were not tested.

## Production preflight — 2026-10-14 06:32 UTC

**Result: blocked; inbox delivery has not been verified.**

- Merchant approval was obtained in chat for one merchant-controlled Gmail admin
  recipient, enabling new-enquiry alerts, and one clearly marked synthetic enquiry.
  The address is intentionally omitted from this evidence record.
- Deployment metadata reports a public active deployment with a successful build.
  This does not establish that the contact-alert changes have been rolled out.
- A read-only production `information_schema.columns` query confirmed that
  `store_contact_notification_settings` is absent and `contact_enquiries` has no
  `email_message_id` column.
- No notification settings were changed, synthetic enquiry submitted, or email
  sent during this verification attempt.
- No mailbox messages were read. Login permissions and order-email recipient
  restrictions were not changed, and historical enquiries were not replayed.

## Remaining verification

The main app rollout must first include the contact-alert implementation and
corresponding production schema. Do not bypass the rollout with direct production
DDL or substitute a preview send for production evidence.

After verifying those prerequisites:

1. Configure the chat-approved recipient through the authenticated admin settings
   and enable alerts without changing customer-email restrictions.
2. Submit exactly one clearly marked synthetic enquiry with a unique marker and
   non-customer Reply-To address. Include synthetic name, topic, order reference,
   and multiline message so the complete content can be checked.
3. Record the enquiry identifier, submission time, delivery state, and saved
   Message-ID. SMTP acceptance must be reported separately from inbox receipt.
4. Inspect only the matching message, with merchant-authorized mailbox access or
   merchant-provided original headers and content. Verify the recipient, customer
   Reply-To, complete enquiry content, and exact Message-ID match. Do not read
   unrelated messages or reply to the synthetic customer address.
5. Record sanitized receipt evidence without credentials, mailbox identifiers, or
   personal addresses. Do not resend on an uncertain outcome; reconcile the saved
   Message-ID first.

There is currently no SMTP acceptance evidence or inbox receipt evidence.

## Production recheck — 2026-10-14 06:34 UTC

After the merchant reported the rollout was done:

- Deployment metadata still reports a public deployment with a successful build.
- The read-only production schema check still shows neither the settings table
  nor the enquiry Message-ID column.
- A read-only request to the live
  `/api/admin/contact-notification-settings` endpoint returned HTTP 404 with
  `Cannot GET /api/admin/contact-notification-settings`, rather than an
  authentication rejection from the expected settings route.
- No test enquiry was submitted, no email sent, and no settings changed.

The rollout prerequisites remain unmet on the checked live deployment. Recipient
approval is already recorded in chat and does not need to be requested again.

## Production recheck — 2026-10-14 06:35 UTC

- Both the verified custom domain and the deployment's `replit.app` address return
  HTTP 404 for `/api/admin/contact-notification-settings`.
- The production schema still lacks both required additions.
- The workspace source registers the settings route under `/api`; the live
  responses therefore do not demonstrate that this implementation is released.
- No notification settings were changed, no enquiry submitted, and no email sent.

The blocker is not specific to custom-domain routing. Confirm which rollout step
completed before attempting another production verification.

## Rollout clarification

The merchant confirmed that the changes were merged into the main app, rather
than released to production. This explains the absent live route and schema.
The delivery verification remains blocked on the main app's production release;
merging alone is not evidence that the live deployment includes these changes.
No further send attempt is authorized beyond the already approved single test,
and no email has been sent during this verification.

## Resume check — 2026-10-14 06:41 UTC

At the merchant's request, production was checked again:

- Deployment metadata reports a successful public deployment.
- The live settings endpoint still returns HTTP 404.
- Read-only production schema discovery still finds neither
  `store_contact_notification_settings` nor `contact_enquiries.email_message_id`.
- No settings were changed, test enquiry submitted, email sent, or mailbox read.

Verification remains blocked on the production release containing the contact-alert
implementation and its schema changes. There is still no SMTP acceptance or
confirmed inbox receipt evidence.

## Published-release check — 2026-10-14 10:54 UTC

- The production schema now includes the private contact-alert settings table,
  enquiry Message-ID, and recipient snapshot.
- The live settings endpoint returns HTTP 401 with `Sign in to continue.`,
  confirming that the route exists and is protected.
- Read-only settings inspection shows alerts are currently disabled and neither
  the legacy recipient nor the recipient list matches the chat-approved inbox.
- The screenshot's specifically named synthetic enquiry (ID 3) was found with
  status `accepted`, a recorded Message-ID, and a recipient snapshot. That
  snapshot does not contain the chat-approved recipient. No unrelated enquiries
  or mailbox messages were inspected.
- The screenshot and database establish SMTP acceptance for that other test,
  not inbox receipt at the approved recipient.
- No settings were changed or additional test submitted during this check.

Next, an authenticated administrator must save the approved recipient and enable
new-enquiry alerts. Verification can then submit the single approved synthetic
test and reconcile only its matching inbox message. Do not use the fallback
recipient or change order-alert settings, login permissions, or customer-email
restrictions to bypass this prerequisite.

## Recipient-save check — 2026-10-14 10:57 UTC

The merchant reported saving the approved recipient with alerts enabled.
However, a read-only production query still returned `enabled = false`, no
exact single-recipient match in `admin_emails`, and no approved legacy recipient.
The settings row's timestamp remained 2026-10-14 10:40:41 UTC.

No test was submitted because persisted settings do not yet corroborate the
reported save. Request the contact settings screen after a page refresh,
including any save confirmation or error, before sending. Do not change
recipients or send to the fallback address to work around this discrepancy.

## Refreshed screenshot inspection

The merchant-provided refreshed screenshot shows:

- An empty explicit recipient field and an unchecked alert-enable checkbox.
- The approved address displayed as a fallback, not as a saved explicit recipient.
- A warning that Gmail credentials or authorization are unavailable in that
  environment.

The production settings query still shows alerts disabled and no approved explicit
recipient or approved fallback. The screenshot does not include a URL, so its
environment cannot be established from the image. Confirm whether it is the live
site or workspace preview before asking the merchant to connect Gmail or save
settings there. No settings, credentials, or permissions were changed, and no
test enquiry or email was sent.

## Approved single-send attempt — 2026-10-14 11:09 UTC

Production settings now show contact alerts enabled, zero explicit recipients,
and a fallback matching the chat-approved recipient. No settings were changed by
this verification.

One synthetic submission is authorized with marker `QA-CONTACT-20261014-1109`.
Use the marker to reconcile the database before any further attempt; do not
repeat the submission if its HTTP or SMTP outcome is uncertain.

Expected synthetic content:

- Name: `QA Contact Inbox Verification`
- Email / Reply-To: `contact-verification@example.invalid` (non-deliverable test address)
- Order reference: `QA-CONTACT-20261014-1109`
- Topic: `Something else`
- Message (line breaks and punctuation significant):

```text
SYNTHETIC TEST ONLY — QA-CONTACT-20261014-1109.
This is the single approved admin contact-alert delivery check, not a customer enquiry.
Content check: size M & colour pink; literal <test> text.
Please do not reply, fulfil an order, or send any customer email.
End marker: QA-CONTACT-20261014-1109.
```

This section records the attempt before the request; acceptance and inbox receipt
must be established separately below.

### Submission and SMTP evidence

- Exactly one POST was made to the published `/api/contact-enquiries` endpoint.
  It returned HTTP 200 and `sent: true`.
- Production stored enquiry ID `4` at `2026-10-14T11:09:51.099Z`.
- Read-only comparisons confirmed the expected name, test email, topic, order
  marker, and entire multiline message were stored without changes.
- The worker initially showed `pending`, then `accepted` on the subsequent
  read-only check at approximately 11:10 UTC. No second submission was made.
- The saved recipient snapshot is an array containing one recipient object and
  includes the exact chat-approved address. The address remains redacted here.
- Recorded Message-ID:
  `<glam-too-contact-6e8f73ac-52eb-4251-8aab-2995db4c2cc6@notifications.glamtoo.invalid>`
- No delivery error is recorded. `delivered_at` is empty; SMTP `accepted` is
  **not** evidence of recipient inbox receipt.

Inbox receipt, actual Reply-To header, complete received content, and received
Message-ID comparison remain pending merchant-provided evidence for this message.
Do not submit or resend another enquiry.

## Uploaded receipt evidence inspection

The two uploaded files show the earlier synthetic enquiry `3`, named
`QA Notification Recheck`, with a different order marker and content. They do
not show enquiry `4` or the approved marker `QA-CONTACT-20261014-1109`.

The uploaded text is a short transcription of the displayed message, not an
original RFC email: it has no Message-ID, Reply-To, To, or Received headers.
Neither file establishes receipt of the approved test in the approved inbox.
No unrelated mailbox was accessed; only the merchant-provided test files were
inspected. No additional enquiry or email was sent.

The approved test remains SMTP-accepted, with inbox receipt, actual Reply-To,
received content, and received Message-ID still unverified. Request only
enquiry `4` from the approved Gmail inbox, including its original headers.

### Follow-up original-email inspection

The subsequently uploaded `.eml` is a valid original email, but is still for
enquiry `3`. Its subject, `X-Glam-Too-Enquiry`, body, and Message-ID identify the
earlier test, and its recipient is not the chat-approved Gmail inbox. Its timestamp
also predates the approved enquiry `4` submission. Personal addresses and transport
headers are intentionally not copied into this record.

It does not satisfy the approved test's receipt or Message-ID comparison.
Ask whether enquiry `4` can be found in the approved Gmail account, including
Spam, before requesting more copies of the older message. Do not resend.

### Merchant-confirmed inbox location

The merchant explicitly confirmed that the approved enquiry `4` was found in the
approved Gmail Inbox using the unique test marker. This is merchant-reported
inbox receipt, distinct from the earlier SMTP-acceptance evidence.

The correct original email for enquiry `4` is still needed to compare its actual
Reply-To, complete received content, recipient, and Message-ID. The supplied
original for enquiry `3` cannot substitute for those checks.

## Approved local history cleanup — 2026-10-14 11:23 UTC

After the completion review identified raw uploads in earlier task commits,
the merchant explicitly approved coordinated sensitive-evidence removal.

- The seven previously committed raw test-evidence paths were filtered from
  the local task branch and its local agent branch. The approved enquiry `4`
  original was never committed and remains ignored.
- Both rewritten branch histories contain no commits for those raw paths;
  no local branch still contains the old raw-email commit.
- The temporary backup references created by filtering were removed, and
  the rewritten branch and HEAD reflogs were expired.
- The current tree hash before and after filtering was identical. Application
  code and the sanitized verification report were preserved.
- The shared main-app branch was not rewritten. No branches were switched,
  no force-push performed, and no platform-managed backup was accessed.
- Raw files remain in the workspace for the merchant; none was physically
  deleted. Current changes exclude them from source control and deployment.

**Remaining limitation:** Removing branch references does not establish physical
erasure of old Git objects or deletion from distributed repositories, checkpoint
copies, or platform-managed backups. No such purge is claimed. A subsequent
checkpoint restored older ancestry on the auxiliary agent reference; the
outgoing task branch remained clean. Repository-owner/platform coordination is
still needed for any broader retained-copy erasure. The completed deliverable
is the verified contact-alert receipt with sanitized outgoing evidence, not a
guarantee of global backup deletion.

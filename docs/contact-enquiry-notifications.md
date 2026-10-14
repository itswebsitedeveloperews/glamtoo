# Contact enquiry notifications

Under **Admin → Contact Form**, an administrator can set multiple private notification
recipients, enable alerts and save. Separate addresses with commas, semicolons or
newlines (up to 20); duplicates are removed. Under **Admin → Payments**, a separate
list controls admin copies of newly paid order confirmations. An empty list uses
the verified account email of the administrator saving the settings (or the
configured bootstrap admin email when no verified account email is available).
The fallback is displayed and saved with the settings. This does not change the storefront contact
address, Gmail sending mailbox, login permissions or order-confirmation allowlist.
Each notification type is off until explicitly enabled and saved. Only new
enquiries/newly finalized paid orders are queued; saving settings never replays
existing messages or generates copies for historical orders.

Gmail must be configured and authorized in the environment running the app.
Connection checks remain under **Payments**. Messages use the authenticated Gmail
sender and the customer's validated address as Reply-To; they are sent only to
each configured contact admin recipient, not the customer. Each address receives
an individual message with its own Message-ID and outcome; other recipient
addresses are not exposed in the message.

## Admin order copies

Admin order jobs are persisted within the paid-order finalization transaction,
one per unique address. Repeat browser/webhook finalization does not create
duplicate jobs. Each has a distinct Message-ID and independent acceptance,
retry or uncertain outcome, so one recipient's failure never resends another's
accepted copy. Admin copies use Gmail and a subject prefixed “Admin copy.”

Customer confirmations retain their existing customer-recipient policy.
Explicitly enabled admin copies are separate from that policy. Disabling admin
copies pauses pending sends; removing a recipient prevents its pending job from
sending. Recipient changes do not reroute old jobs to newly added addresses.

## Persistence and outcomes

Contact enquiries are stored before a successful customer response. SMTP is
best-effort after that response, so a provider outage cannot turn a stored enquiry
into a submission error. The admin inbox shows full messages and refreshes every
30 seconds while open.

- `not_configured`: alerts are disabled, the recipient is missing, or Gmail is not configured.
- `sending`: SMTP has started; an interrupted process can leave the outcome pending.
- `accepted`: SMTP accepted the message. This is **not** proof of inbox delivery.
- `partial`: some contact recipients were accepted and others failed or remain uncertain.
- `failed`: email was not accepted; the enquiry remains available.
- `uncertain`: the SMTP outcome cannot be determined; reconcile the saved
  Message-ID before any manual resend.
- Historical `delivered` records are labeled “Legacy provider accepted,” because
  the old provider HTTP response did not prove inbox delivery.

There is no automatic retry or historical backfill. A durable outbox would be a
separate improvement; retries after ambiguous SMTP outcomes must not duplicate emails.

The development schema update adds private recipient lists, a verified admin
fallback, per-recipient enquiry outcomes and snapshotted order-copy recipients.
Apply the corresponding schema changes when publishing; no production
database was changed by this implementation.

## Verification

The disposable-database `contact-notifications` suite covers authorization,
recipient changes, invalid settings, full inbox data, HTML escaping, isolated
SMTP acceptance/failure/uncertainty, response-before-SMTP completion, no historical
replay, and persistence failures. SMTP is mocked; no real emails are sent.
The settings component is browser-tested with intercepted fixture responses,
not a live authenticated administrator session.

If the settings endpoint returns HTML instead of JSON, the UI reports an
unavailable/outdated API rather than exposing a JSON parse error. The live
endpoint returned HTTP 404 HTML during this update; publication of the updated
API and schema is still required. Unknown API endpoints now return JSON 404s.

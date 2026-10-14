# Production customer confirmation rollout

## Scope and current release state

Production customer confirmations may go to every customer's **saved paid-order
email**, without customer registration or a shop test-recipient approval.
No request-supplied address, current profile email or admin recipient can replace
that saved address. Stripe verification, order ownership, payment-resolution
checks, the outbox unique constraint, locked claims, five automatic attempts,
provider Message-ID persistence and uncertain-outcome protection remain in force.
Admin-copy settings and refund sending policy are unchanged.
The existing separately approved one-time safe-failure retry retains its one
additional attempt and saved Message-ID; it is not an automatic budget reset.

This implementation is in a task branch, **not published**. Production's saved
configuration below is ready for the new code, but the old published code does
not read the new customer-only switches. Do not report live sending as enabled
or two-inbox receipt as verified until the merged release is running and that
verification is complete.

## Exact non-secret configuration changes

Removed `ORDER_CONFIRMATION_SEND_TO_ALL` and
`ORDER_CONFIRMATION_ENABLED_SINCE` from the shared scope; set:

| Scope | Setting | Value |
| --- | --- | --- |
| Production | `ORDER_CONFIRMATION_SEND_TO_ALL` | `true` |
| Production | `ORDER_CONFIRMATION_ENABLED_SINCE` | `2026-10-14T12:50:38.225Z` |
| Development/staging | `ORDER_CONFIRMATION_SEND_TO_ALL` | `false` |
| Development/staging | `ORDER_CONFIRMATION_TEST_RECIPIENTS` | empty string |

An empty staging list explicitly sends to **nobody**, not everybody.
Set that staging-only list to comma-separated controlled addresses to permit
staging tests. When this optional list is absent, the original restricted
`ORDER_EMAIL_ALLOWED_RECIPIENTS` list is used. Explicit customer-only `false`
does not inherit a legacy "send to all" switch.

Preserved shared configuration:
`ORDER_EMAIL_SEND_TO_ALL=false`, `ORDER_EMAIL_TRANSPORT=gmail_smtp`,
`GMAIL_SMTP_AUTH_MODE=oauth2`, the existing public shop URL, SMTP/OAuth credentials,
the original secret allowlist, and saved admin-copy recipients/enabled state.
Refunds continue to use their original policy. **Do not enable the shared
`ORDER_EMAIL_SEND_TO_ALL` switch as a substitute for this release.**

The activation timestamp excludes previously queued, newly eligible customer
emails; it is not reset at each deploy. Existing authorized test recipients
retain their original eligibility. Initial Gmail-authorization cutoff protection
also remains in place for automatic sending.

## Controlled release of one previously blocked confirmation

In an order's **Email Status → Customer confirmation**, the explicit
**Approve and send confirmation** action names the saved recipient and requires
confirmation. Refresh/polling/order navigation remain read-only.

The authenticated, origin-checked endpoint is:

`POST /api/admin/orders/:reference/customer-email/retry`

Body: `{"confirmation":"send_saved_order_confirmation"}`.
Custom recipient fields are rejected. Only a saved paid order with no payment
resolution and an existing pending, **zero-attempt** customer outbox row with
no provider/send/acceptance/delivery evidence is eligible. The current sending
configuration and staging allowlist still apply.

Approval records the administrator and timestamp under order/notification locks
and schedules only that row. It does not send inside the HTTP request, create
orders, reset attempts or modify the admin-copy row/settings. Repeated/concurrent
approvals are idempotent. Accepted/delivered rows return "already processed"
without another send. Sending, uncertain, bounced, failed or attempted rows need
separate reconciliation; this control cannot override them. A specific approval
allows just that historical row past activation/Gmail-initial-authorization
cutoffs, not the rest of the queue.
The separate **Review one-time retry** control for proven pre-acceptance
failures remains available under its existing checks. That explicit retry can
pass the customer activation cutoff, but cannot bypass the Gmail-authorization
cutoff, current recipient policy, paid-order checks or uncertain-outcome guard.
The existing missing-admin-copy approval and its exact-recipient confirmation
are retained alongside the zero-attempt customer approval.

## Release procedure after merge

1. Merge the branch. The existing post-merge setup installs dependencies and
   applies the declared non-destructive development schema.
2. Review production's environment-scoped values against the table above.
   Keep OAuth credentials and the existing Gmail callback unchanged.
3. In the normal Publishing workflow, review the database change summary:
   add nullable `customer_retry_approved_at` (timestamp) and
   `customer_retry_approved_by` (text) to `store_order_email_notifications`.
   There must be no order/outbox deletion or historical requeue. Development
   already has these columns; read-only inspection found them absent in
   production before release.
4. Release **both** the API and storefront through the existing managed
   publication configuration so the schema and new worker/UI are included.
   Do not run a hand-written production migration or modify live order rows.
   No publication was performed from this task branch.
5. Check release logs and the authenticated Email Status API, then verify that a
   fresh paid customer outside the old test list is eligible under the
   production customer-only policy. Do not relax the refund/shared switch.
6. Run the two-inbox protocol below. If sending needs pausing, set the
   production customer-only switch to `false`; its restricted list behavior
   remains fail-closed. Do not reset accepted messages or roll back order data.

Replit applies managed database schema changes through the normal Publish flow;
production app secrets/environment settings are separate from development.
References: [environment separation](https://docs.replit.com/features/data-and-storage/development-and-production),
[publishing](https://docs.replit.com/features/publishing/overview).

## Gmail capabilities and remaining limitations

The transport uses authenticated TLS to `smtp.gmail.com:465`, OAuth2 with
`https://mail.google.com/`, and the authenticated sending mailbox. Customer SMTP
`To` and envelope recipients are taken only from the saved paid order. There is
no Gmail recipient-test allowlist in this transport. Google's OAuth test-user
restriction concerns authorizing the sender, not each recipient consenting to
receive an ordinary transactional email.

- Gmail imposes account-dependent rate, recipient and daily sending quotas.
  Personal Gmail documents a 500-email/day limit; Workspace limits differ and
  may vary with trial/account status. Quota exhaustion can pause sending.
- An External Google OAuth app left in **Testing** can have refresh tokens expire
  after seven days with Gmail scopes. Saved authorization exists in production,
  but its current Google-console publishing status was **not independently
  verified** here; saved authorization is not proof that the next SMTP login
  will succeed. Consent/app verification and mailbox access must remain valid.
- SMTP acceptance and a Message-ID do **not** prove inbox arrival. Spam filtering,
  bounces, mailbox policy and account suspension remain possible. There is no
  automatic delivered event from this Gmail SMTP transport.
- The redesigned inline-PNG/table email passed MIME and responsive preview checks,
  but real Gmail/Outlook rendering and two customer receipts remain unverified.
  This is not a bulk-email service or a delivery guarantee.

Official references: [Gmail SMTP OAuth](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol),
[personal Gmail limits](https://support.google.com/mail/answer/22839?hl=en),
[Workspace limits](https://support.google.com/a/answer/166852?hl=en),
[OAuth token expiry](https://developers.google.com/identity/protocols/oauth2#expiration).

## Evidence and required two-inbox protocol

Offline checks passed in disposable local PostgreSQL databases with fake SMTP:
two distinct saved recipients each get only their own correct order details,
including guest checkout, with no duplicate send. Concurrency, historical
activation, restricted staging, paid-order checks, accepted/uncertain protection,
retry behavior, credential exclusion and protected HTTP handling are covered.
The new approval UI passed synthetic desktop/mobile cancel, submit, error,
duplicate-click and order-switch-race checks. These tests sent **no real mail**.

Live acceptance remains blocked on the merged release and two explicitly
approved distinct inboxes with matching paid orders:

1. Identify the two controlled inboxes and their saved paid order references.
   Do not change a historical order's email to manufacture a match. New
   payments/orders, if necessary, require separate approval.
2. For each matching order, check saved items/options, quantities, GBP totals,
   shipping, discount, included VAT and address, and existing email outcome.
3. For a genuinely blocked zero-attempt row, use the per-order approval once.
   For a newly eligible row let the normal worker send it. Never retry an
   accepted message solely because receipt evidence is missing.
4. Record each accepted timestamp and Message-ID separately. Obtain the
   matching received original from each approved inbox and compare Message-ID,
   recipient, reference and complete order details. Inspect spam as well as
   inbox if relevant; do not treat acceptance as receipt.
5. Retain only a sanitized comparison report. Raw `.eml`/`.msg`/`.mbox` originals
   and the receipt-upload directory are excluded from source/deployment.
   Do not mark a Gmail outbox row "delivered" from a synthetic event or conflate
   merchant-provided receipt evidence with provider telemetry.

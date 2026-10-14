# Order-confirmation email investigation and setup

## Confirmed findings

- The four reported orders are persisted as paid, with no payment-resolution issue.
- Their synchronized Stripe PaymentIntents have `livemode = false`.
- None has an email-outbox record. The existing payment finalizer did not queue a purchase confirmation.
- The existing MailerSend worker only handled refund notifications. Clerk authentication emails use a separate service; delivery of Clerk codes does not establish order-email delivery.
- `MAILERSEND_API_TOKEN` and `MAILERSEND_FROM_EMAIL` are absent from the checked development/shared and production environment settings.
- The merchant subsequently approved switching order confirmations to Gmail SMTP and supplied credentials plus a restricted recipient list through Secrets. The actual SMTP connection reached Google, but authentication was rejected with `EAUTH / SMTP 534`. No email was sent by that authentication check and no inbox delivery has been proved.

No historical order was resent. Production database inspection was read-only. Tests created and removed only isolated development fixtures, used simulated Stripe/provider responses, and sent no external email.

## Implemented path

1. The existing Stripe verification and ownership checks remain in place.
2. A new transition to paid queues `order_confirmation` in the same transaction as the saved order, inventory settlement and coupon redemption.
3. The existing unique order/type constraint and row-locking claims prevent repeated callbacks, confirmation refreshes and concurrent workers from sending another confirmation.
4. A separate worker sends Gmail SMTP messages using persisted order/item snapshots, not current catalog prices.
5. The authenticated mailbox is the sender, over certificate-verified TLS on `smtp.gmail.com:465`. A deterministic RFC Message-ID is saved before sending for reconciliation.
6. A successful SMTP transaction and matching accepted recipient record `accepted`, **not** inbox delivery. Gmail SMTP supplies no delivery callback in this implementation; controlled-inbox evidence is still needed.
7. A provider marker keeps previous MailerSend records separate. Only those records can use its read-only delivery polling. New confirmations default to Gmail and never fall back automatically.

### States and retries

`pending` means queued; `sending` means claimed; `accepted` means the configured provider accepted a message, not that it reached an inbox; `delivered`, `bounced` and `failed` describe recorded outcomes.

Explicit temporary SMTP 4xx rejections and connection failures known to happen before sending retry at 1, 2, 4 and 8 minutes, with at most five send attempts. Authentication errors and permanent SMTP rejections stop as failed. Raw SMTP errors/responses and credentials are not logged.

`uncertain` means a disconnect during/after SMTP DATA or an interrupted sender may have followed acceptance. These jobs are frozen rather than automatically resent. Reconcile the saved RFC Message-ID in Gmail first. SMTP has no idempotency key; never claim globally exactly-once delivery merely because an outbox row is unique.

Legacy MailerSend delivery lookups remain independent and cannot consume Gmail records. Gmail records stay accepted until separately proven delivered; a Gmail Sent-folder entry alone is not recipient-inbox proof.

## Configuration

Runtime configuration names:

| Name | Purpose |
| --- | --- |
| `GMAIL_SMTP_USER` | Gmail or Google Workspace mailbox used to authenticate and send |
| `GMAIL_SMTP_AUTH_MODE` | `oauth2` for the approved client-credential setup; `app_password` remains an explicit alternative only |
| `GMAIL_SMTP_CLIENT_ID` | Secret-stored Google OAuth Web application client identifier |
| `GMAIL_SMTP_CLIENT_SECRET` | Secret-stored Google OAuth application secret; never an SMTP password |
| `GMAIL_SMTP_OAUTH_REDIRECT_URI` | Exact HTTPS callback URI registered in Google Cloud; development can derive it from the development domain |
| `GMAIL_SMTP_APP_PASSWORD` | Used only when App Password authentication is explicitly selected |
| `SESSION_SECRET` | Stable server encryption secret for saved Google authorization; rotating it requires reauthorization |
| `GMAIL_SMTP_FROM_NAME` | Optional; defaults to Glam Too Boutique |
| `GMAIL_SMTP_REPLY_TO_EMAIL` | Optional monitored reply-to; defaults to authenticated mailbox |
| `ORDER_EMAIL_TRANSPORT` | `gmail_smtp` (default); `mailersend` is retained only as an explicit legacy choice |
| `ORDER_EMAIL_PUBLIC_URL` | HTTPS shop origin verified for the environment |
| `ORDER_EMAIL_ALLOWED_RECIPIENTS` | Comma-separated dedicated test-recipient allowlist |
| `ORDER_EMAIL_SEND_TO_ALL` | Explicit unrestricted-recipient rollout flag; leave absent or false during testing |

The currently verified published shop origin is `https://glamtoo.webdesignessex.io`. Use the appropriate verified origin when testing another environment.

Adding Gmail credentials alone does not enable unrestricted sending. Purchase confirmations require the existing safe recipient policy. Refund emails retain their existing MailerSend configuration and policy; this switch does not migrate or activate them. New confirmations are queued only on a new paid transition; existing paid records and historical imports are not backfilled.

### Gmail setup and verification

1. Use the merchant-controlled sending mailbox and Google OAuth **Web application** client. The merchant supplied the sender and Client ID/Secret through Secrets; these application credentials alone do not authorize mailbox access.
2. Enable the Gmail API in that Google Cloud project for the sender-profile check. Register the exact callback URL shown under **Admin → Payments → Order confirmation emails**. If Google's consent app is in Testing, add the sender as a test user; Gmail authorizations for external Testing apps can expire after seven days.
3. Click **Connect Gmail**, select the configured sender and approve the SMTP scope `https://mail.google.com/`. This broad Gmail scope is required by SMTP; the app uses it only for sender verification, authentication and order-confirmation sending, not reading messages. The available Replit Gmail connector is API-based and does not grant this SMTP scope.
4. The one-time callback requires a secure browser cookie, persisted one-use state, PKCE and a current administrator role. It confirms the mailbox, authenticates SMTP without sending, then encrypts the refresh token server-side. No refresh token is pasted into chat or returned to the browser. Client/account changes invalidate the stored authorization; there is no App Password fallback while OAuth is selected.
5. Only confirmations queued after the first authorization become eligible. Reconnecting the same configured client preserves that initial cutoff and does not replay old confirmations. Previously queued rows are retained, not deleted.
6. Keep the verified shop URL, dedicated recipient allowlist and unrestricted-sending switch off during setup. Use **Check authentication** or `pnpm --filter @workspace/api-server run verify:gmail-smtp`; neither sends a message or proves inbox delivery.
7. After authorization and the implementation/schema are available in the intended environment, make a **new** sandbox purchase. Match the saved Message-ID and order reference with controlled recipient-inbox evidence. Do not replay historical orders. Production uses its own configured callback URL and may require separate authorization when its database is separate.
8. For an `@gmail.com` sender Google manages its domain authentication. For a Google Workspace custom domain, check its Google-provided SPF/DKIM setup and DMARC policy. This implementation does not spoof an unrelated sender address.

## Verification

Commands:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test:gmail-smtp
```

The 68 automated checks comprise the existing regression, checkout/account and legacy email suites, nine isolated Gmail SMTP tests and eleven isolated OAuth tests. OAuth coverage includes admin/Origin restrictions, state expiry/replay, PKCE, secure cookies, mailbox/scope checks, encrypted persistence, no password fallback, sanitized errors and no-send verification. Provider responses are simulated and cannot prove real Google authorization or inbox delivery.

Provider delivery responses in automated tests are **simulated**, not real delivery evidence.

### Affected implementation files

- `artifacts/api-server/src/orderService.ts`
- `artifacts/api-server/src/orderConfirmationNotifications.ts`
- `artifacts/api-server/src/orderConfirmationTemplate.ts`
- `artifacts/api-server/src/gmailSmtp.ts`
- `artifacts/api-server/src/emailRecipientPolicy.ts`
- `artifacts/api-server/src/refundNotifications.ts`
- `artifacts/api-server/src/index.ts`
- `lib/db/src/schema/order-email-notifications.ts`
- `artifacts/api-server/test/email-confirmations.test.ts`
- `artifacts/api-server/test/gmail-smtp.test.ts`
- `artifacts/api-server/test/fixtures/gmail-smtp.ts`
- `artifacts/api-server/scripts/verify-gmail-smtp.mjs`
- `artifacts/api-server/test/guest-checkout.test.ts`
- `artifacts/api-server/test/build.mjs`
- `artifacts/api-server/package.json`

Development schema additions are non-destructive. Production receives the schema through the normal Publish flow, not an application startup migration.

## Remaining blockers

### Fresh regression order — 14 October 2026

Read-only production inspection correlated **GM-03B7D305** with its paid
GBP 23.98 order and a single pending confirmation entry, zero attempts and
no provider message ID. It was paid/queued at 04:49:05.391322 UTC;
initial Gmail authorization was saved at 05:43:33.722496 UTC. The current
worker deliberately excludes messages queued before that authorization.
The row's default `mailersend` marker does not establish that a provider
was contacted. Required outbox/provider columns exist in production.

This establishes a current-source eligibility blocker consistent with the
nonreceipt, not proof of all deployed worker/configuration health. The order
was not changed or resent. A new isolated regression preserves the cutoff and
checks a fresh eligible order using mocked SMTP only. Separately authorized
fresh sandbox-order receipt is still required; see
[fresh-launch-regressions.md](fresh-launch-regressions.md) for the diagnosis
and controlled-inbox protocol.

The merchant confirmed completion on 2026-10-14 with an admin screenshot showing “Authorization saved” and “Gmail SMTP authentication passed. No email was sent; inbox delivery is not yet verified.” The production callback is registered and mailbox authorization is complete. This is merchant-provided evidence of authentication, not an independently observed recipient-inbox delivery.

The merchant subsequently requested automatic customer confirmations alongside
admin copies. Customer confirmations now have a separate, explicitly enabled
rollout; the shared refund-email recipient policy remains restricted.
Controlled-inbox delivery through a new approved order remains unverified.
Gmail SMTP acceptance cannot be automatically upgraded to delivered or used as
inbox-delivery evidence. If the Google consent app remains in Testing, account
for its possible seven-day refresh-token expiry before production rollout.

## Automatic customer confirmations and redesigned email

Customer confirmations use these separate non-secret **production** settings:

- `ORDER_CONFIRMATION_SEND_TO_ALL=true`
- `ORDER_CONFIRMATION_ENABLED_SINCE=<ISO activation timestamp>`

Both must be present and valid. The timestamp prevents enabling automatic
confirmations from releasing the historical queue. Existing explicitly approved
test recipients retain their previous eligibility. Gmail authorization,
confirmed payment, terminal/uncertain-send protection and retry limits still
apply. Turning the customer-only flag off restores the existing test-recipient
policy. Staging has its own optional `ORDER_CONFIRMATION_TEST_RECIPIENTS`
override; an explicitly empty list allows nobody. Do not set
`ORDER_EMAIL_SEND_TO_ALL=true` merely to enable customer
confirmations: that shared policy also controls refund notifications.

**An older pending confirmation is not automatically retried by this change.**
It requires a separate, specific approval path rather than a bulk queue release.
No production message or real test email was sent while implementing this
change, and no published Gmail/Outlook rendering or inbox delivery is claimed.
The per-order approval control, exact environment changes, release/schema steps,
Gmail limitations and outstanding two-inbox protocol are documented in
[customer-confirmation-rollout.md](customer-confirmation-rollout.md).
The new configuration takes effect when the updated server code is running;
the already-published server is not changed by local template previews.

Both customer messages and admin copies use the redesigned, centred,
table-based order email: approved inline-PNG branding, payment/order summary,
products and options, discount/shipping/VAT-inclusive totals, delivery details,
and the existing guest-safe contact or signed-in account link. Body/supporting
copy is 16px/14px. Gmail receives the logo as an inline MIME attachment; the
legacy MailerSend path receives its base64 inline attachment representation.

Verification included workspace type checking, API build, isolated
email-confirmation and Gmail SMTP suites, customer policy and status projection
tests, template/MIME tests, and desktop/390px rendered previews. The new isolated
SMTP cases prove a fresh customer outside the test list is accepted exactly
once while a pre-activation unapproved confirmation stays pending with zero
attempts. All external delivery responses in those tests were simulated.

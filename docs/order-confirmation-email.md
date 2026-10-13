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

`pending` means queued; `sending` means claimed; `accepted` means MailerSend accepted a message; `delivered`, `bounced` and `failed` describe recorded outcomes.

Explicit temporary SMTP 4xx rejections and connection failures known to happen before sending retry at 1, 2, 4 and 8 minutes, with at most five send attempts. Authentication errors and permanent SMTP rejections stop as failed. Raw SMTP errors/responses and credentials are not logged.

`uncertain` means a disconnect during/after SMTP DATA or an interrupted sender may have followed acceptance. These jobs are frozen rather than automatically resent. Reconcile the saved RFC Message-ID in Gmail first. SMTP has no idempotency key; never claim globally exactly-once delivery merely because an outbox row is unique.

Legacy MailerSend delivery lookups remain independent and cannot consume Gmail records. Gmail records stay accepted until separately proven delivered; a Gmail Sent-folder entry alone is not recipient-inbox proof.

## Configuration

Runtime configuration names:

| Name | Purpose |
| --- | --- |
| `GMAIL_SMTP_USER` | Gmail or Google Workspace mailbox used to authenticate and send |
| `GMAIL_SMTP_APP_PASSWORD` | Secret Google App Password, not the normal account password |
| `GMAIL_SMTP_FROM_NAME` | Optional; defaults to Glam Too Boutique |
| `GMAIL_SMTP_REPLY_TO_EMAIL` | Optional monitored reply-to; defaults to authenticated mailbox |
| `ORDER_EMAIL_TRANSPORT` | `gmail_smtp` (default); `mailersend` is retained only as an explicit legacy choice |
| `ORDER_EMAIL_PUBLIC_URL` | HTTPS shop origin verified for the environment |
| `ORDER_EMAIL_ALLOWED_RECIPIENTS` | Comma-separated dedicated test-recipient allowlist |
| `ORDER_EMAIL_SEND_TO_ALL` | Explicit unrestricted-recipient rollout flag; leave absent or false during testing |

The currently verified published shop origin is `https://glamtoo.webdesignessex.io`. Use the appropriate verified origin when testing another environment.

Adding Gmail credentials alone does not enable unrestricted sending. Purchase confirmations require the existing safe recipient policy. Refund emails retain their existing MailerSend configuration and policy; this switch does not migrate or activate them. New confirmations are queued only on a new paid transition; existing paid records and historical imports are not backfilled.

### Gmail setup and verification

1. Use a merchant-controlled Gmail or Google Workspace mailbox with 2-Step Verification. Generate a dedicated Google App Password where account policy allows it. Accounts that prohibit App Passwords need a separately approved OAuth/Workspace relay setup.
2. Provide the mailbox and App Password through the secure Secrets flow; never paste credentials into chat. The available Gmail connector is API-based, not this SMTP authentication method.
3. Set the shop URL and dedicated recipient allowlist before testing. Keep unrestricted sending off.
4. Run `pnpm --filter @workspace/api-server run verify:gmail-smtp` to verify TLS/authentication without sending any email. A successful result proves authentication only.
5. After the implementation/schema is published to the intended environment, make a **new** sandbox purchase. Match the saved Message-ID and order reference with controlled recipient-inbox evidence. Do not replay historical orders.
6. For an `@gmail.com` sender Google manages its domain authentication. For a Google Workspace custom domain, check its Google-provided SPF/DKIM setup and DMARC policy. This implementation does not spoof an unrelated sender address.

## Verification

Commands:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test:gmail-smtp
```

The 57 automated checks comprise the existing regression, checkout/account and legacy email suites plus nine isolated Gmail SMTP tests for the default transport/no fallback, authenticated sender/TLS, registered/guest confirmations, SMTP acceptance versus delivery, bounded retry/recovery, authentication/permanent rejection, ambiguous DATA disconnects, recipient restrictions and no-send credential verification.

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

Google authentication remains blocked despite credentials being present. Supply a valid dedicated App Password for the configured Google mailbox and satisfy its account security policy before retrying. Actual inbox-delivery evidence remains outstanding. The published site has not been updated by the agent. Gmail SMTP acceptance cannot be automatically upgraded to delivered or used as inbox-delivery evidence.

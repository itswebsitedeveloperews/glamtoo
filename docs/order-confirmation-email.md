# Order-confirmation email investigation and setup

## Confirmed findings

- The four reported orders are persisted as paid, with no payment-resolution issue.
- Their synchronized Stripe PaymentIntents have `livemode = false`.
- None has an email-outbox record. The existing payment finalizer did not queue a purchase confirmation.
- The existing MailerSend worker only handled refund notifications. Clerk authentication emails use a separate service; delivery of Clerk codes does not establish order-email delivery.
- `MAILERSEND_API_TOKEN` and `MAILERSEND_FROM_EMAIL` are absent from the checked development/shared and production environment settings.
- Provider-account logs, verified domains, suppression lists and a controlled inbox are not connected. No actual order-email delivery has been proved.

No historical order was resent. Production database inspection was read-only. Tests created and removed only isolated development fixtures, used simulated Stripe/provider responses, and sent no external email.

## Implemented path

1. The existing Stripe verification and ownership checks remain in place.
2. A new transition to paid queues `order_confirmation` in the same transaction as the saved order, inventory settlement and coupon redemption.
3. The existing unique order/type constraint and row-locking claims prevent repeated callbacks, confirmation refreshes and concurrent workers from sending another confirmation.
4. A separate worker sends MailerSend requests using persisted order/item snapshots, not current catalog prices.
5. HTTP acceptance records the provider message ID and `accepted` state. It does **not** record delivery.
6. Read-only MailerSend message/email lookups validate the message ID and recipient before recording delivery, rejection or hard bounce. Their results never initiate another send.

### States and retries

`pending` means queued; `sending` means claimed; `accepted` means MailerSend accepted a message; `delivered`, `bounced` and `failed` describe recorded outcomes.

Explicit rate-limit/service-unavailable rejections retry at 1, 2, 4 and 8 minutes, with at most five send attempts. Permanent errors and a 202 response without a message ID stop as failed. Provider responses may contain recipient data, so their bodies are not logged.

`uncertain` means a network timeout, ambiguous server error or interrupted sender may have followed acceptance. MailerSend's consulted send API does not document an idempotency key. These jobs are frozen rather than automatically resent. Reconcile the `glam-too-<order-id>` provider tag first. Never claim globally exactly-once HTTP delivery merely because an outbox row is unique.

Delivery lookups run independently, initially after two minutes and subsequently every thirty minutes. Read-permission failures leave the message accepted, with a diagnostic error; they never mark it delivered or cause another send.

## Configuration

Runtime configuration names:

| Name | Purpose |
| --- | --- |
| `MAILERSEND_API_TOKEN` | Secret with email sending and message/email read permissions |
| `MAILERSEND_FROM_EMAIL` | Sender identity on a MailerSend-verified domain |
| `MAILERSEND_FROM_NAME` | Optional; defaults to Glam Too Boutique |
| `MAILERSEND_REPLY_TO_EMAIL` | Optional monitored reply-to; defaults to sender email |
| `ORDER_EMAIL_PUBLIC_URL` | HTTPS shop origin verified for the environment |
| `ORDER_EMAIL_ALLOWED_RECIPIENTS` | Comma-separated dedicated test-recipient allowlist |
| `ORDER_EMAIL_SEND_TO_ALL` | Explicit unrestricted-recipient rollout flag; leave absent or false during testing |

The currently verified published shop origin is `https://glamtoo.webdesignessex.io`. Use the appropriate verified origin when testing another environment.

Adding credentials alone does not enable unrestricted sending. Both purchase and refund workers require a safe recipient policy, preventing old refund jobs from unexpectedly reaching real customers during provider setup. New purchase confirmations are queued only on a new paid transition; existing paid records and historical imports are not backfilled.

### Sender and DNS steps still requiring access

1. Connect the existing MailerSend account so domain verification, sender settings, pauses, trial restrictions, bounces and suppression lists can be inspected.
2. Select a sender/reply-to mailbox controlled by the merchant.
3. Add the exact SPF/DKIM records supplied by that account to the sending domain's DNS, and confirm verification in MailerSend. Configure DMARC as appropriate. Do not invent DNS record values or assume the website's domain is also a verified sending domain.
4. Provide the runtime token securely through Secrets. A MailerSend MCP connection is for agent diagnostics, not an application runtime transport.
5. Set the shop URL and dedicated recipient allowlist before testing. Keep unrestricted sending off.
6. After publishing the implementation/schema, make a **new** sandbox purchase, check its provider message/email IDs, and obtain a provider-delivered record or controlled-inbox evidence. Do not replay the reported historical orders.

## Verification

Commands:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run typecheck
```

Verified suites: 25 existing regressions, 11 checkout/account tests and 12 email-confirmation tests. They cover authenticated/guest success, declined/incomplete payment, cancelled authentication, successful retry, duplicate finalization/refresh, concurrent email workers, retry backoff/exhaustion, permanent rejection, suppression/no message ID, ambiguous send outcomes, bounce/rejection, recipient mismatches, safe routing, old paid records, and snapshot/VAT/link correctness.

Provider delivery responses in automated tests are **simulated**, not real delivery evidence.

### Affected implementation files

- `artifacts/api-server/src/orderService.ts`
- `artifacts/api-server/src/orderConfirmationNotifications.ts`
- `artifacts/api-server/src/orderConfirmationTemplate.ts`
- `artifacts/api-server/src/emailRecipientPolicy.ts`
- `artifacts/api-server/src/refundNotifications.ts`
- `artifacts/api-server/src/index.ts`
- `lib/db/src/schema/order-email-notifications.ts`
- `artifacts/api-server/test/email-confirmations.test.ts`
- `artifacts/api-server/test/guest-checkout.test.ts`
- `artifacts/api-server/test/build.mjs`
- `artifacts/api-server/package.json`

Development schema additions are non-destructive. Production receives the schema through the normal Publish flow, not an application startup migration.

## Remaining blockers

MailerSend account/runtime credentials, verified sender/DNS access, allowed controlled recipients and actual delivery evidence remain outstanding. The published site has not been updated by the agent. The application changes are verified independently; no end-to-end delivery claim is made.

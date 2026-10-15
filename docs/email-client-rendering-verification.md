# Branded email client verification

## Status: synthetic test control implemented; inbox review still pending

No Gmail or Outlook rendering result is verified by this report.

The merchant approved one controlled Gmail recipient for up to five synthetic
messages and offered to provide screenshots from Gmail and Outlook. The same
mailbox can be viewed in both clients; a second recipient is not required.
Recipient addresses must not be copied into this report.

The workspace has an OAuth client configuration, but the existing Gmail SMTP
configuration cannot obtain a matching saved mailbox authorization. The
authentication-only command therefore exits before connecting or sending.
No messages were sent, no orders or enquiries created, no refunds triggered,
and no existing notification settings or recipient restrictions changed.

After the merchant reported reconnecting Gmail in the preview, the
authentication-only check still reported no usable authorization. A read-only
database check confirmed that this task workspace has no saved Gmail
authorization row. The approved recipient is also absent from both the shared
and order-confirmation test-recipient lists. No list was changed. The preview
where authorization was completed must be identified before another setup
attempt; successful authorization in a different environment would not authorize
copying its tokens or sending from it.

The merchant subsequently supplied the custom-domain site address. Deployment
metadata confirmed that it is the published production app, with a successful
current build. A read-only production query confirmed that a saved Gmail
authorization row exists there. This establishes the environment mismatch, not
the validity of the production token or permission to send from production.
No token, encrypted token, personal address, or production notification record
was retrieved. Production authorization must remain in production.

The merchant confirmed that Gmail cannot be connected to the preview.
Preview authorization is therefore not an available next step; do not repeat
that request. Inspection of the existing Gmail and order-email routes found
authentication verification and controls for real order notifications, not a
standalone five-template synthetic-send facility. Those real-order controls
must not be repurposed for this test. The merchant then explicitly approved
adding an admin-only synthetic test control. It has now been implemented in
this task branch, but has not sent any real messages.

## Approved synthetic test control

The Payments workspace now includes **Synthetic email branding tests** below
the Gmail connection. It uses the existing Gmail SMTP transport for template
samples only, including the refund samples. It neither activates nor verifies
the live refund provider.

- The server requires admin authorization, matching shop origin, an exact
  approved recipient and explicit confirmation of five messages.
- `EMAIL_BRANDING_TEST_RECIPIENT` and `EMAIL_BRANDING_TEST_APPROVAL_ID` configure
  one separate approval. These were configured for the merchant-approved inbox
  through environment settings, not hardcoded into application logic or this report. Customer and refund
  recipient policies were not changed. Broad customer-send switches cannot
  enable this facility.
- All five sample identifiers and recipients are persisted before sending.
  A unique database key consumes the approval atomically, preventing concurrent
  requests, refreshes, process restarts or lost responses from sending it again.
- Any SMTP failure stops the remaining samples. Accepted and ambiguous outcomes
  remain frozen for reconciliation. Failed or unused samples cannot be retried
  through the panel either. Do not rotate approval configuration to work around
  a missing receipt; another batch requires new explicit approval.
- Each subject and body is labelled synthetic. No actual order, enquiry,
  payment, refund or business outbox record is created.
- The admin panel shows each marker, subject, saved Message-ID and transport
  outcome. Refreshing is read-only. No result is described as delivered.
- The database schema addition is included in the existing post-merge schema
  setup. The test table was created only in development during this task;
  production was queried read-only and was not migrated or deployed here.

The panel needs an environment with the existing sender authorization to send.
The isolated preview still has no mailbox authorization; no further preview
connection is requested.

## Checks performed

- `pnpm --filter @workspace/api-server run verify:gmail-smtp`:
  initially could not bundle the shared PNG wordmark. Its bundler now uses the
  same base64 PNG loader as the template tests. The command subsequently
  reached its configuration check and reported that Gmail credentials or
  mailbox authorization are not configured.
- Read-only configuration inspection confirmed that the OAuth client can be
  constructed; no secret values or saved tokens were displayed.
- `pnpm --filter @workspace/api-server run test:email-branding`: all 14 tests
  passed. These check template content, escaping, inline branding and offline
  MIME packaging, not inbox appearance or delivery.
- `pnpm --filter @workspace/api-server run test:email-branding-controls`: all
  11 tests passed in a disposable local PostgreSQL database with a mocked SMTP
  transport. They cover admin-only access, no-cache responses, same-origin and
  recipient enforcement, strict confirmation, missing authorization, failed
  authentication, exactly five samples, unchanged business records and policies,
  concurrent requests, uncertain outcomes, acceptance-write failure and
  permanent duplicate prevention.
- API and storefront TypeScript checks passed.
- The running preview rejects signed-out requests to the new endpoint with
  HTTP 401 and `Cache-Control: no-store`.
- One browser pass over the actual panel in a dev-only, network-intercepted
  component harness passed desktop/mobile checks: explicit confirmation,
  exactly one POST, five accepted-not-delivered outcomes, consumed approval
  after refresh/reload, uncertain outcomes, lost-response reconciliation,
  unavailable configuration and no horizontal overflow at 390px. A minor
  disabled-button appearance issue was fixed afterward with local opacity
  styling. No admin session, real API request or SMTP send was used by that
  browser check. This is not live admin-to-SMTP integration evidence.
- Both managed preview services restarted and served requests. The existing
  API startup also ran its Stripe webhook reconciliation and logged a missing
  previously managed webhook followed by orphan cleanup. That startup behavior
  was not changed by this task; no payment or refund action was tested.

## Resume safely

1. Use the new admin-only control once it is available in the already-authorized
   shop environment. Preview authorization is unavailable. Do not
   replace SMTP with an inbox API, switch authentication modes, copy tokens
   between environments, or use historical order controls.
2. Confirm the exact recipient shown in the panel matches the merchant's
   approval. The synthetic facility uses only its separate test-recipient
   approval, never the normal order/refund allowlists. Do not disable or broaden
   those existing policies. Sending performs authentication-only verification
   before consuming the synthetic approval.
3. Send no more than one new synthetic example of each variant to the approved
   recipient: order confirmation, contact admin alert, refund processing, refund
   complete, and manual refund resolution. Use a unique test marker and save
   each Message-ID before attempting delivery (the panel does both). Do not use
   real or historical business records, activate workers, or run automatic retries.
4. If an outcome is uncertain or accepted, reconcile that Message-ID before
   considering another attempt. Missing screenshots do not authorize resending.
5. Establish private evidence exclusions before collecting any originals or
   screenshots. Keep originals, recipient addresses, and transport headers out
   of source control and deployment packages; retain only sanitized findings.
6. Inspect each exact received message in the matrix below. Record client and
   operating-system versions, date, mailbox location and test marker. Opening
   an HTML preview or an unsent EML is not an inbox-rendering check.

## Required real-client evidence

Each row remains **not checked**. Each must cover all five message variants.
For Outlook, identify the version explicitly, including whether Windows desktop
uses the classic or new client.

| Client | Device | Appearance | Result |
| --- | --- | --- | --- |
| Gmail | Desktop | Light | Not checked |
| Gmail | Desktop | Dark | Not checked |
| Gmail | Mobile | Light | Not checked |
| Gmail | Mobile | Dark | Not checked |
| Outlook | Desktop | Light | Not checked |
| Outlook | Desktop | Dark | Not checked |
| Outlook | Mobile | Light | Not checked |
| Outlook | Mobile | Dark | Not checked |

For every observation, inspect the wordmark and tagline, background and text
contrast, white button labels, readable body copy, complete content, item and
total alignment, wrapping, clipping, and the footer. Confirm embedded branding
loads without enabling remote images. Capture any dark-mode color changes
rather than assuming explicit HTML colors are preserved.

SMTP acceptance, previous contact-email receipt, and the passing offline tests
do not satisfy any row of this matrix.

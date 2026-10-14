# Order-email status verification

Verified 14 October 2026 against the running development preview and its existing
saved orders. This is **not verification of the published shop, email sending,
inbox receipt, or confirmed delivery**.

## Result

The approved existing administrator reached the real status endpoint and the
Email status panel. The live response matched saved notification data. Read-only
refresh, unattended polling and switching orders worked. Two defects were found:

1. Error responses lack an explicit cache-prevention header.
2. Populated status rows with a long Message-ID clip at phone width.

This was a verification-only task. Neither defect was patched, and application
behavior, users, payments, settings and saved order data were not changed.

## Live evidence

| Check | Observed result |
| --- | --- |
| Existing approved admin | Temporary ticket session for an existing, already-authorized Clerk user; no generic sign-in helper or role overrides |
| Saved payment-reference lookup | Authenticated GET returned 200 with `orderId`, `notifications`, `notQueued`, and `Cache-Control: no-store` |
| Database agreement | Read-only scan of five saved orders found zero corresponding email-notification rows; API returned an empty notification array |
| Customer and admin channels | Actual panel displayed separate missing-customer and missing-admin-copy explanations, including no automatic historical sends |
| Refresh | Clicking Refresh produced a real 200 GET; recorded request count increased from 1 to 2 |
| Polling | Without further UI action, another matching 200 GET arrived within a 35-second wait; count increased from 2 to 3 |
| Exact polling interval | Not timed; the source specifies 30 seconds, but the browser evidence establishes only the unattended additional request |
| Order switching | Selecting another saved order changed the payment reference, produced its own real 200 response, and displayed that selected order |
| Signed-out access | Real 401 with only the generic sign-in error |
| Missing order | Real authenticated 404 with only the generic not-found error |
| Credential exclusion | Live payload had the expected status shape and no credential-like configuration keys; errors disclosed no internal details |

The normal order-list endpoint was deliberately **not called**. Its GET can
reconcile legacy payments, and the read-only preflight found reconciliation
incomplete. For navigation, the browser received a snapshot of genuine saved
orders from read-only queries. The status endpoint itself was **unmocked** for
the live evidence above.

## Browser-only response simulations

Existing notification data could not exercise every state without creating or
changing orders. After the live checks, temporary response overrides tested:

- Customer acceptance without a delivery timestamp: the UI correctly explained
  that provider acceptance is not inbox delivery.
- A delivered admin copy with recorded stages and timestamps.
- A restricted customer recipient and two independent admin recipients with
  different blocking conditions.
- Expanded Message-ID details, including a 200-character synthetic value.
- A delayed response for order A arriving after switching to B: B remained
  selected and A's unique synthetic marker did not appear.
- A 503 response preserving the last loaded rows and displaying the error;
  desktop Retry returned a synthetic 200 and cleared the alert.

These observations are **simulated UI evidence**, not live notification,
delivery or SMTP evidence. Live 403 and 503 were not induced by changing users
or disrupting services. Their server behavior was checked in isolated HTTP tests.

## Defects

### Error cache headers

The live 401 and 404 responses had no `Cache-Control` header. The successful 200
response correctly had `no-store`.

In `artifacts/api-server/src/routes/stripe.ts`, the status handler sets this
header only on success. Its 400/404/503 branches and the earlier
`requireAdmin` 401/403/503 branches do not set it. Cache prevention should be
applied before authorization for this endpoint, without changing access rules.
A follow-up has been proposed for this finding.

### Phone-width clipping

At 390×844, with four synthetic status rows and the long Message-ID:

- Email status panel: 596px wide; right edge at 614px.
- Stage content: 530px wide; right edge at 581px.
- Refresh control: right edge at 596px.
- Long Message-ID content also extended outside the viewport.

The page did not expose useful horizontal scrolling, so content and controls
were clipped. Mobile Retry could not be clicked; Retry was verified at desktop
width instead. At 1280px, the panel, stages, Message-ID and Refresh fitted.
The screenshot was inspected with sensitive fields blurred.

The **live empty panel was not measured at phone width**. This finding is
specifically demonstrated with populated, browser-simulated status data. Inspect
the `.aoes*` styles in `artifacts/glam-me/src/index.css` and the component's
containing order-detail grid when fixing it; preserve desktop behavior.

## Repeatable automated checks

```sh
pnpm --filter @workspace/api-server run test:order-email-status
pnpm --filter @workspace/api-server exec node test/run-order-email-status-http.mjs
```

- **7 projection tests passed**: planned provider, recipient restrictions,
  configuration/history reasons, independent admin recipients, paused payment
  states, acceptance versus delivery, Message-ID and unrelated-record filtering.
- **6 new isolated HTTP tests passed**: real Express route and real admin
  middleware, with fake Clerk/status-service boundaries, for 401/403, authorization
  503, authorized 200/no-store, invalid-reference 400, missing-order 404, and
  status-service 503. Error bodies exclude internal credential sentinels.

The HTTP runner does not import the application entrypoint or start workers.
Its child process has inherited credentials removed and an unused loopback
database URL. It never uses the running shop's database or external providers.
It writes compiled output to the already-ignored test output directory.
These tests do not claim that the missing error cache headers pass.

## Safety and cleanup

- The user explicitly approved the configured administrator for this temporary
  read-only check. Existing verified identity and authorization were checked
  before issuing short-lived, existing-user sign-in tickets.
- Only read-only Clerk user lookup methods were executed. No user creation,
  update, email-verification, identity, metadata or role-write API was invoked.
- Email addresses, verification, metadata and role compared unchanged.
  Normal sign-in timestamps changed. A separate broader identity comparison
  was inconclusive because its baseline and final projections used different
  keys; it is not evidence of a changed identity.
- Each newly created session was distinguished from preexisting sessions and
  successfully revoked. Preexisting sessions were not revoked.
- Tickets were consumed on activation. Exact-ticket revocation was rejected
  with `sign_in_token_cannot_be_revoked_code`; revocation is **not** claimed.
  The SDK response did not supply `expiresAt`; the requested 120-second TTL
  elapsed, and an additional 125-second cleanup wait was recorded.
- Private temporary state was removed and browser contexts closed. No tickets,
  credentials, recipient identities or saved-order identifiers are in this report.
- The browser guard blocked one incidental dashboard catalog PUT before it
  reached the server. The continuation attempted and forwarded zero non-Clerk
  writes, and withheld catalog loading to avoid further migration attempts.
- No emails, new orders, order changes, payment/settings changes, provider
  reconfiguration or production-data mutations were performed. The normal API
  workflow was not restarted because startup can configure webhooks, reconcile
  payments and start email workers.

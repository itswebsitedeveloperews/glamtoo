# Fresh launch regression findings — 14 October 2026

## Scope and evidence

This is a **source/build verification**, not a deployment or launch approval.
The supplied text report is present; its linked `evidence/` files and traces
are not. Historical browser observations therefore cannot be matched to an
exact deployed bundle or inspected trace. Current source already gates
catalog-dependent routes and queues confirmation emails. Neither inferred
historical cause is assumed to apply unchanged.

Production reads below were read-only. No production data, paid order,
credentials, recipient restrictions, email cutoff, product wording, slug,
shipping policy, coupon policy or indexing settings were changed. All write
tests used a disposable loopback PostgreSQL cluster. Provider sends in backend
tests were mocked. The real Stripe diagnostic loaded its SDK and card fields
only; it did not submit a payment or create an intent.

## Finding-by-finding status

| Finding | Current result | Qualification / remaining closure evidence |
| --- | --- | --- |
| GT-010 new-product checkout | **Protected and verified in source/production build.** API-only simple product survives guest add, basket link, direct checkout, reload, delayed catalog, stalled local-media storage, failed catalog/retry and refresh. Billing and a simulated supported payment adapter remain usable. | The original fast redirect is not reproduced in current gated source. A separate real publish/inventory race was found and fixed: catalog and sellable inventory now commit atomically. No real sandbox payment was made for this task. |
| GT-009 email | **Diagnosed; receipt verification blocked.** Reported order and its queue entry exist in production. Queue time precedes Gmail authorization; zero attempts and no message ID. | Preserve historical-send cutoff. Requires separately authorized **fresh** sandbox order to an approved owned inbox and independent receipt evidence. Do not mark delivered or resend the historical order. |
| GT-013 mobile CLS | **Reproduced, fixed and measured.** Delayed-image production-build samples were 0.338691 three times. After width reservation, three new 390×844 contexts measured 0 / 0 / 0 maximum-session CLS. | Repeatable local fixture/lab result only, not a field percentile or Core Web Vitals certification. Real traffic/device/font/network distributions remain unmeasured. |
| GT-004 contrast | **Reproduced and corrected in source/build.** Six-route axe WCAG A/AA scans with populated basket/checkout pass text contrast. Applicable navigation/CTA/account hover and focus scans pass. | Not a claim of complete WCAG conformance. Real Stripe scan remains separate; axe cannot establish every image-overlay or assistive-technology outcome. |
| GT-011 Stripe hidden focus | **Reproduced and qualified, not closed.** Real Card Element keyboard traversal reaches number → expiry → CVC → exits the iframe. Axe still reports `aria-hidden-focus` on `.__PrivateStripeElement-input`. | Actual screen-reader speech/browse-mode behavior has not been manually verified. Requires assistive-technology testing and, if needed, vendor confirmation. No Stripe private DOM was removed, retagged or hidden; no axe rule was suppressed. |
| GT-012 orphan stock | **Removal path fixed and verified.** Simple/variation inventory is archived transactionally, while stock rows, reservations and order snapshots remain. Built-in seeding cannot recreate deleted catalog products. | Named production orphan was inspected read-only; cleanup is **not authorized/performed**. Scoped procedure below. No blanket cleanup. |
| GT-008 spelling | **Pending merchant approval.** Exact proposed corrections below; authoritative names and all existing URLs remain unchanged. | No approval was supplied. Do not silently rename or seed corrected text. |

## Checkout, publishing and inventory

Catalog-dependent routes still wait for authoritative catalog metadata; there
is no seed/local-price fallback. Media hydration now runs independently:
an IndexedDB request that never resolves cannot prevent checkout. Saved line
identifiers survive errors and retry. Missing products/variants are not treated
as an empty bag and are not silently deleted. Truly empty checkout returns to
the empty basket. The query-string fallback also accepts a simple product's
intentionally empty size when browser cart persistence is unavailable.

The former admin sequence committed the catalog, then asynchronously wrote
inventory. A new published style could be publicly visible before checkout
inventory existed, or remain unpurchasable after a failed second request.
Publication now commits inventory with the catalog transaction. Invalid
inventory rolls the whole save back. Unpriced drafts may still be saved.

Removal only archives inventory owned by product IDs removed from that save,
including their variation keys and exact legacy blank-owner simple keys.
It never deletes stock rows or reservation/order foreign-key targets. A new
reservation must lock an **active** inventory row. A reservation already
established before retirement can still finalize; cancellation can return its
stock without republishing it. The legacy inventory-sync endpoint shares the
catalog lock and cannot revive removed IDs or replay an old browser snapshot.

### Stock edit contract

`PUT /api/admin/catalog` accepts optional `stockUpdates: string[]` containing
exact inventory keys (`product` or `product:variation`) deliberately edited
in the product form. Existing stock is preserved for other keys, even when
browser live-stock overlays differ from old catalog JSON. New inventory uses
its creation stock. This prevents a removal, category save or metadata rename
from resetting stock bought since the admin opened the page. Explicit stock
edits remain supported. Refresh old admin tabs after this source is released.
The OpenAPI contract and generated clients/schemas document the optional field.

## GT-009: trigger → queue → eligibility → provider → receipt

Read-only production observations:

| Check | Observed |
| --- | --- |
| Order reference | GM-03B7D305 |
| Payment | `paid`, resolution `none`, GBP 23.98 |
| Saved amounts | Items 19.99; shipping 3.99; total 23.98 |
| Paid/queued time | 2026-10-14 04:49:05.391322 UTC |
| Outbox | One joined order-confirmation entry, `pending`, attempts `0` |
| Provider marker | `mailersend` default on the unclaimed row; **not evidence of a send**. Worker stamps the selected transport when claiming. |
| Message ID / acceptance / delivery | All absent |
| Saved Gmail initial authorization | 2026-10-14 05:43:33.722496 UTC |
| Schema | Required order-email provider/status/message-ID columns and Gmail authorization tables exist |

The current finalizer queues only a **new paid transition**, in the same
transaction as payment settlement. The unique order/type constraint prevents
duplicate entries. Worker startup is present in the API entrypoint. Claiming
requires a paid eligible order, due pending job, safe recipient policy,
configured transport/shop URL, and a queue timestamp on/after the first Gmail
authorization. Reconnection preserves that initial cutoff for the same client.

This order predates authorization by about 54 minutes. In current source that
alone excludes it from worker eligibility, consistent with the observed zero
attempts. Its missing message ID means there is no provider acceptance to trace
and no delivery event to infer. This is **not proof** that all other deployed
configuration, client binding, worker liveness or mailbox authorization remains
valid. Exact deployed source revision and current SMTP authentication were not
independently established. No verified application defect justifies weakening
the historical-send guard.

Added isolated regression: a pre-authorization queue entry stays pending at zero
attempts, while a fresh post-authorization entry reaches mocked SMTP acceptance
without being marked delivered. Existing suites cover missing safe routing,
missing credentials, recipient exclusion, authentication rejection, temporary
failure, uncertain DATA outcomes, interrupted sends, duplicate claims and
deduplicated finalization. Simulated acceptance is not inbox evidence.

### Safe remaining verification

1. Obtain separate merchant approval for **one fresh sandbox purchase**, naming
   the intended environment and owned allowlisted recipient. No unrestricted
   rollout, historical resend or mutation of the existing paid order.
2. In that environment, use Admin → Payments → Order confirmation emails →
   **Check authentication**. This authenticates only; it sends no message.
   Confirm shop origin, safe routing and initial authorization without exposing
   credentials. Resolve any authentication/client-binding failure first.
3. Make the approved fresh sandbox order. Correlate its new order reference,
   paid transition, single queue entry, send attempt, provider and saved RFC
   Message-ID. Inspect actual received inbox/spam content and headers.
4. Verify item name/quantity/amount, configured shipping, discount/VAT if
   applicable, total and order reference against persisted snapshots. Record
   Message-ID correlation and owned-inbox receipt separately from SMTP `250`.
5. If uncertain, reconcile the saved ID rather than resending blindly.
   If no approval/access is supplied, GT-009 remains receipt-blocked.

See also [order-confirmation-email.md](order-confirmation-email.md).

## GT-013: measured sources and method

The initial immediate/data-image fixture measured 0.035055 in each of three
contexts, with footer movement while loading. Reserving logo and product-loading
geometry addressed that source, but **did not establish a delayed-image fix**.
Adding a genuinely delayed network image to the production build reproduced
the report's larger problem at 0.338691 in all three samples.

At the offending shift, `.detail-form` moved from y=318 to y=739.171875.
The gallery pagination moved from y=188 to y=651.171875; the zoom control and
add-to-bag/policy geometry moved too. The mobile gallery is a column flex
container with start alignment. Its unconstrained viewer derived width from
the unloaded image, collapsing before intrinsic media dimensions arrived.
The viewer now reserves `width: 100%` with non-growing flex sizing on mobile;
the existing image aspect ratio then reserves the full height before loading.
Gallery carousel, lightbox, selectors and mounted-route state are preserved.

Tests use a fresh browser context for each 390×844 sample, a 900 ms delayed
catalog, 800 ms delayed image response and 1,300 ms delayed size-guide response.
The observer is installed before navigation with `buffered: true`, excludes
recent input and records individual source rectangles. CLS is the maximum
session total, with <1 second gaps and <5 second session duration, not an
unbounded sum. Fonts settle before the final 2.6-second observation period.
Tests also require equal, nonzero gallery dimensions before/after media load.
Final samples: **0 / 0 / 0**. No field LCP/CLS claim is made.

Raw run logs are in ignored `generated-artifacts/fresh-launch/`; the tests
recreate source-node and rectangle attachments. They are evidence outputs,
not files required by the application.

## GT-004 and GT-011 accessibility

The original bright pink `#e23d6f` yields 4.09:1 with white and 3.64:1
against the paper background. Shared text/CTA pink is now `#bd2855` and deep
pink is `#a93458`. Clerk uses the same accessible family with an explicit
hover/focus background; its generated lighter hover was tested and corrected.
Regular/supporting copy stays 16px/14px; no text was shrunk to qualify as large.

The six routes are `/`, `/shop`, `/product/military-style-jacket`, `/account`,
`/cart`, `/checkout`. Nonempty basket and checkout fixtures use the API-only
product, not an empty-page shortcut. Full axe A/AA results are attached; text
contrast assertions also run in applicable interactive states. Pink sale/shop
navigation, white CTA labels, badges, moment headings and checkout section
numbers are covered. Contrast thresholds remain 4.5:1 normal and 3:1 qualifying
large text.

The **real** Stripe Card Element was mounted using the app's public payment
configuration and current `https://js.stripe.com/v3/` SDK, with mutation requests
blocked and no card values or payment submissions. Keyboard Tab reached number,
expiry, CVC, then exited the iframe. The sole recorded A/AA violation in that
diagnostic was `aria-hidden-focus` targeting the private Stripe helper.
This does not establish screen-reader safety or prove a vendor defect.

Vendor references checked:
- <https://docs.stripe.com/payments/elements>
- <https://docs.stripe.com/payments/card-element>
- <https://docs.stripe.com/js/deprecated/handle_card_setup_element>

Those references do not establish an approved fix for this exact private node.
Keep supported `create("card", options)` / `mount` / `destroy` lifecycle and
16px styling. The placeholder uses the supported style option with the
accessible muted color. Do not remove private inputs, change their attributes,
or suppress the accessibility rule. Remaining check: real NVDA/Firefox or
VoiceOver/Safari traversal, spoken labels/errors and focus restoration; consult
Stripe if the helper has a demonstrated assistive-technology impact.

## GT-012: named orphan and restricted recovery

Production read-only inspection found key `1791952756162`, owner ID matching
that key, no variation, name `QA-LAUNCH-20261014-1791952755723`, active, stock 2.
There were zero matching current catalog products, reservations and order-item
product references at inspection. **No row was changed.** This is production
evidence, not permission to perform the report's proposed staging cleanup.

After explicit approval identifying the environment and exact QA fixture:

1. Reconfirm environment, exact key/owner/name and expected stock; take a
   narrowly scoped before snapshot. Do not infer identity from the ID alone.
2. In one transaction acquire the same catalog advisory lock, then lock the
   exact inventory row. Recheck catalog membership, variation ownership,
   reservation references, historical order items/inventory keys and any
   in-flight payment/order allocation. Stop on any mismatch/reference.
3. Archive **only this verified row** (`active=false`); do not delete it or
   rewrite stock. If any historical/in-flight reference exists, use normal
   retirement/reconciliation instead of a special cleanup.
4. Verify exactly one intended row changed, the public inventory excludes it,
   and all unrelated keys/stocks match the before snapshot. Roll back on an
   unexpected change.
5. Retain the snapshot. Restoration, if separately approved, must verify
   catalog ownership and payment state again; never run a blanket reactivation.

Do not run this procedure merely because this document contains it.

## GT-008: merchant approval requested, not applied

| Current authoritative wording | Proposed wording | URL to preserve exactly |
| --- | --- | --- |
| Aysemetric Sequin Dress | Asymmetric Sequin Dress | `/product/aysemetric-sequin-dress` |
| Printed Aysemetric Tracksuit | Printed Asymmetric Tracksuit | `/product/printed-aysemetric-tracksuit` |
| Doubled Breasted Knit Belt Dress | Double Breasted Knit Belt Dress | `/product/doubled-breasted-knit-belt-dress` |

Approval should explicitly cover names plus matching occurrences in existing
descriptions. Do not change facts, SKUs, media, stock, price or unrelated copy.
Use the authoritative admin catalog, not bundled reseeding; keep explicit slugs
and redirect history. The inventory metadata rename regression verifies URL,
history and reserved stock preservation, using synthetic wording only.
Merchant approval and actual production wording changes remain pending.

## Executed verification

After the final batch, both managed workflows restarted and served requests;
the 390×844 actual catalog product screenshot showed intact gallery and size
controls. Startup was **not warning-free**: development order-email setup is
not configured, Clerk reports structural styling/versioning warnings, and the
pre-existing Stripe bootstrap recovered a missing webhook registration and
logged deletion of a managed webhook it classified as orphaned. No bootstrap
logic was changed in this work. This automatic external configuration side
effect is distinct from the no-payment/no-email test policy and needs a
separate preview/production webhook-isolation investigation before further
provider-configuration actions. No further restart was performed to investigate it.

- Workspace TypeScript checks and frontend/API production builds.
- Disposable PostgreSQL backend suites: regressions, guest checkout, checkout
  safety, email confirmations, Gmail SMTP, Gmail OAuth, shipping and fresh launch.
  All 107 checks passed, including the added OAuth-cutoff case. The expanded
  inventory suite was rerun after stock-intent protection.
- Storefront unit checks: 11 passed. SEO/security checks: 12 passed.
  Shared shipping checks: 15 passed.
- Browser pass: 25 passed and three delayed-image CLS failures (the useful
  reproduction); all three CLS cases then passed after the width fix.
  This is not presented as a single initially green run.
- Browser coverage retains previous variable-price behavior, configured shipping
  and promises, zoom/noindex/social-link protections, guest/account checkout
  safety, gallery state, empty catalogs and cart identifier persistence.
  No coupon shipping-discount basis/rounding policy was changed; quote-stage
  sold-out acceptance is not called demonstrated overselling.

Reproduce with:

```sh
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/glam-me run build
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run build
# Requires an explicitly disposable loopback cluster, never DATABASE_URL:
TEST_DATABASE_ADMIN_URL=postgresql://USER@127.0.0.1:PORT/postgres \
  pnpm --filter @workspace/api-server run test:isolated
STOREFRONT_PRODUCTION_BUILD=1 pnpm --filter @workspace/glam-me run test:storefront-browser
# Optional real SDK/keyboard diagnostic only; no payment submission:
STOREFRONT_PRODUCTION_BUILD=1 STRIPE_ACCESSIBILITY_DIAGNOSTIC=1 \
  pnpm --filter @workspace/glam-me exec playwright test test/launch.spec.ts -g 'actual Stripe'
```

The production-build browser switch fulfills built HTML/assets on the existing
preview origin; it does not start another storefront or access the published
shop. New launch cases use this output; pre-existing storefront cases exercise
the source server. Production receipt, screen-reader confirmation, merchant
wording approval and authorized orphan cleanup are not substituted by these
automated checks.

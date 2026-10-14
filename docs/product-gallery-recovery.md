# Product gallery recovery — 14 October 2026

## Update: merchant supplied a complete reference shop

The merchant subsequently supplied `https://glamtoo.webdesignessex.io/shop` and
explicitly requested comparison of every product and addition of its gallery
photos. The published reference's public catalog contains all 15 matching
products with three supporting photos each. This resolves the previous evidence
gap described below; the table under **Full catalog audit** records the initial
screenshot-only investigation, not the final result after this request.

All 15 products match by ID, name, slug and SKU. A visual comparison of every
current primary, reference primary and reference supporting set confirms the
same garments/bags. No product is added, deleted, renamed, repriced or restocked.

Final result: **all 15 products have four views**, with 36 supporting-photo
references restored across the 12 previously empty galleries:

- Printed Aysemetric Tracksuit
- Aysemetric Sequin Dress
- Doubled Breasted Knit Belt Dress
- Daisy Embellished Knit Dress
- Gold Button Waist Coat And Trouser Set
- Button Up Belted Trouser Set
- Leather Cape Jacket
- Long Sleeved Bow Knitted Top
- Button Up Short Sleeve Blazer
- Faux Leather 3 Compartment Tote Bag
- Faux Leather Medium Tote Bag
- Mini Tote Bag

The jacket, tracksuit and cardigan galleries already present are unchanged. The
jacket/cardigan reference uses different object IDs for byte-identical photos,
so their existing durable references and ordering are preserved, not duplicated.
The two reference products sharing the same outfits are kept as separate
merchant-owned products with their reference-specific gallery ordering.

The additional recovery is pinned in
`artifacts/api-server/scripts/reference-gallery-recovery.mjs`, including
per-product pre-repair fingerprints and SHA-256 hashes for original media bytes.
`restore-product-gallery.mjs --reference-shop` applies the entire batch under one
lock and transaction, with a full catalog backup and one durable receipt. A
changed product or unavailable/changed image aborts the complete batch. Rerunning
after success is a no-op, even after intentional gallery removals. These repairs
are never run by automatic post-merge setup. No continuing synchronization with
the reference site is introduced.

### Explicit operator procedure

Initialize the catalog through the API first. Audit the intended environment,
saved references, source images and pinned pre-repair fingerprints before
choosing a repair. A fresh catalog or intervening merchant edits must not block
ordinary merges, and are not permission to overwrite the catalog.

Only an operator targeting the approved environment should run either command
from the workspace root:

```sh
pnpm --filter @workspace/api-server exec node scripts/restore-product-gallery.mjs
pnpm --filter @workspace/api-server exec node scripts/restore-product-gallery.mjs --reference-shop
```

The first is the screenshot-backed tracksuit repair; the second is the
reference-shop batch. Run only the approved repair. If fingerprints no longer
match, stop and re-audit rather than bypassing the guard.

The reference site was read only; all changes are to development data. Local
source snapshots, before/after comparison sheets and verification results are in
the ignored `generated-artifacts/gallery-reference/` directory.

Focused follow-up verification: eight repair safety tests and workspace
typechecks; comparison of all product fields except restored galleries; public
image checks against the pinned original hashes; and an opt-in real-catalog
browser check for all 15 counts plus representative clothing/bag navigation and
reload (`VERIFY_REFERENCE_GALLERIES=1`).

## Finding and recovery scope

This was a saved-reference loss, not a CSS regression. The development catalog
contained 15 published products. Mesh Floral Sleeve Tracksuit (109) had
`galleryImages: []` in the public API **and** the stored catalog. Its three
supporting photos were still present in App Storage, publicly readable, and
visually match the supplied four-view reference screenshot. The bundled product
has always supplied only its primary photo; adding seed defaults would not
recover these uploads.

The existing shared renderer already provides the vertical desktop rail,
selected border, synchronized count, arrows, keyboard input, swipe events and
enlarged image. No renderer, styling, price, inventory, or cart change was needed.

The precise historical write that emptied the gallery cannot be established:
the catalog stores only its latest row, there was no catalog revision table, and
Git history contains application code rather than merchant catalog snapshots.
The empty array is present before client normalization, so neither normalization
nor a failed media response explains the lost rail.

## Verified original order

1. Existing bundled primary: `mesh-floral-sleeve-tracksuit.jpg`.
2. Front torso/detail: `/objects/uploads/e21d69ba-69d0-4f17-9521-fc6936bc2f4e`.
3. Back: `/objects/uploads/96ba7ef5-6e5c-4e08-aa34-d5dc0835d9ce`.
4. Wider front view: `/objects/uploads/742554e7-72d4-4f08-acab-0f205c9a14e3`.

The three supporting objects were uploaded on 21 September 2026. All four are
distinct original photographs, not resized copies added to inflate the count.
Their order is established by `attached_assets/image_1791983023986.png`.

## Full catalog audit

| Product | Views before → after | Action |
| --- | --- | --- |
| Military Style Jacket (108) | 4 → 4 | Existing ordered gallery preserved |
| Mesh Floral Sleeve Tracksuit (109) | 1 → 4 | Verified three supporting originals restored |
| Printed Aysemetric Tracksuit (110) | 1 → 1 | No verifiable historical gallery/order |
| Denim Trim Ribbed Cardigan (111) | 4 → 4 | Existing ordered gallery preserved |
| Aysemetric Sequin Dress (112) | 1 → 1 | No verifiable historical gallery/order |
| Doubled Breasted Knit Belt Dress (113) | 1 → 1 | No verifiable historical gallery/order |
| Daisy Embellished Knit Dress (114) | 1 → 1 | No verifiable historical gallery/order |
| Gold Button Waist Coat And Trouser Set (115) | 1 → 1 | Merchant's uploaded primary preserved |
| Button Up Belted Trouser Set (116) | 1 → 1 | No verifiable historical gallery/order |
| Leather Cape Jacket (117) | 1 → 1 | No verifiable historical gallery/order |
| Long Sleeved Bow Knitted Top (118) | 1 → 1 | No verifiable historical gallery/order |
| Button Up Short Sleeve Blazer (119) | 1 → 1 | No verifiable historical gallery/order |
| Faux Leather 3 Compartment Tote Bag (120) | 1 → 1 | No verifiable historical gallery/order |
| Faux Leather Medium Tote Bag (121) | 1 → 1 | No verifiable historical gallery/order |
| Mini Tote Bag (122) | 1 → 1 | Merchant's current primary preserved |

The storage audit found 67 uploads, including duplicates and old/unused product
views. This is not enough evidence to classify the other empty galleries as
regressions: an orphaned image may have been deliberately removed. Those products
were not modified. To restore any of them safely, the merchant must identify
which galleries were unintentionally cleared and supply their intended ordering
(a previous catalog export, admin/browser catalog, or screenshot is sufficient).
No claim is made that all unused uploads belong in the storefront.

## Safety and handoff

- `artifacts/api-server/scripts/restore-product-gallery.mjs` applies only the
  audited tracksuit record. A full-product fingerprint rejects any intervening
  product edit or deletion instead of overwriting it.
- The repair takes the same advisory lock as catalog saves and a row lock.
- It checks original bytes and public read permissions, saves a full pre-repair
  catalog snapshot in `catalog_gallery_repairs`, and writes only the targeted
  product's `galleryImages`, all in one transaction.
- A durable receipt makes reruns no-ops, **including after an admin deliberately
  clears the repaired gallery**. There is no seed fallback or automatic
  repopulation on GET.
- The post-merge setup runs this idempotent development-data repair after the
  managed schema push. If the tracksuit changed before merge, it stops for
  re-audit. Do not bypass the fingerprint or substitute seed data.
- Only development data was repaired. No production deploy or production
  catalog write was performed.
- Local visual audit downloads/screenshots are under the ignored
  `generated-artifacts/gallery-audit/`; the durable original files remain in
  App Storage and the full catalog backup remains in PostgreSQL.

## Verification

- Full workspace typecheck passed.
- Five focused repair safety tests passed (narrow patch, mismatch rejection,
  one-time receipt, transactional backup/update ordering, inaccessible media).
- Isolated PostgreSQL catalog/launch checks passed, including ordered gallery
  persistence through an unrelated product save and older-client saves, explicit
  removals, and a genuine single-image case. Existing backend regressions passed.
- Desktop screenshot shows the real tracksuit's original left-hand vertical
  thumbnail rail, selected border and `1 / 4`, matching the supplied reference.
- Browser checks cover four-view selection, previous/next wraparound, keyboard,
  touch events, zoom, route transitions, refresh, and tablet/mobile overflow.
- A separate opt-in browser test, without catalog fixtures, verifies all four
  real tracksuit images load in a new shopper context and remain after reload.

Focused commands:

```sh
node --test artifacts/api-server/test/gallery-repair.test.mjs
pnpm run typecheck
# Requires an explicitly provisioned disposable loopback PostgreSQL cluster:
pnpm --filter @workspace/api-server run test:isolated fresh-launch regressions
VERIFY_RECOVERED_GALLERY=1 STOREFRONT_BASE_URL="https://$REPLIT_DEV_DOMAIN" \
  pnpm --filter @workspace/glam-me exec playwright test \
  --config playwright.config.ts storefront.spec.ts \
  --grep 'four original-order|multi-image gallery preserves|recovered real catalog'
```

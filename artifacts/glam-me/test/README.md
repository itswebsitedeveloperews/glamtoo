# Storefront launch regression checks

From the workspace root:

```sh
pnpm --filter @workspace/glam-me test:storefront
STOREFRONT_BASE_URL=https://your-development-preview pnpm --filter @workspace/glam-me test:storefront-browser
```

The browser suite uses `@playwright/test` and automatically uses Replit's Chromium when available. Outside Replit, provision Playwright's Chromium browser in your test environment, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing compatible Chromium executable. Both the frontend and API workflows must be running (the API also serves Clerk's development proxy).


## Product second-photo previews

```sh
pnpm --filter @workspace/glam-me test:storefront-browser product-hover.spec.ts
```

`product-hover.spec.ts` is also included in the normal browser-suite command.
It uses per-test catalog and colored SVG media fixtures; merchant products and
settings are never edited. Browser SSR snapshots are removed so the fixture
catalog is authoritative. Unknown API calls and mutations are blocked and fail
the test; Clerk bootstrap responses are synthetic and signed out.

Coverage includes category, Shop, homepage Obsessions and moment cards, related
products, guest wishlist, header search suggestions and bag recommendations.
Each checks the exact second normalized detail-gallery URL, successful image
decoding, alternate opacity and image geometry on hover, then primary restoration
on pointer exit. Additional cases cover single/duplicate gallery entries, failed
requests, keyboard focus and Enter navigation, reduced-motion fades, touch-only
first-tap navigation without alternate downloads, and an in-place catalog refresh
whose replacement image is deliberately delayed. No fixed animation sleeps or
external photo dependencies are used. This is Chromium rendering coverage, not a
screen-reader, physical-device, gallery-persistence or detail-slider test.


## Admin navigation visual policy (not an accessibility assertion)

```sh
pnpm --filter @workspace/glam-me test:storefront-browser admin-nav-style.spec.ts
```

`admin-nav-style.spec.ts` loads the complete `src/index.css` cascade into a
CSS-only fixture, without package font imports. Each test uses a fresh browser
context and blocks all network requests; no app, authentication, customer or
admin data is loaded or changed.

The active item must paint `--button-bg` (`#e23d6f`) with white text normally,
and `--button-hover-bg` (`#c93260`) with white text on hover, real Tab
`:focus-visible`, and held mouse `:active`. Those states are tested separately
so one selector cannot hide a missing selector for another state. Disposable
token overrides prove token dependency, not just matching hardcoded colors.
Inactive items retain transparent/neutral backgrounds and neutral text.
Negative controls prove lighter accent backgrounds and dark active text fail.

These exact visual-policy checks are separate from the existing contrast tests.
White on the merchant-approved normal pink does **not** meet normal-size AA.
No contrast thresholds are lowered. The older `accent-contrast.spec.ts` also
still expects the superseded non-button accent on active admin navigation; its
historical assertions are not evidence that the current visual policy passes AA.

## Product image lightbox keyboard

```sh
pnpm --filter @workspace/glam-me test:storefront-browser --grep "product image lightbox keyboard"
```

These focused checks use synthetic catalog responses on the real product page.
They cover pointer and keyboard opening, initial close-button focus, forward and
reverse Tab wrapping, Escape and close-button dismissal, focus restoration,
arrow-key image navigation and wrapping, accessible dialog naming, and the
single-image case at 820px. The multi-image flow also runs at 390px and 1440px.
No product, cart, image-size, or style configuration is changed.

The Replit development banner can intercept pointer clicks on the top-right
close button in the external proxied preview. Check the pointer hit target before
calling that an application failure; do not move or restyle the shop's controls
to work around development-only UI. Keyboard activation of the focused close
button and Escape must still work. These tests do not force clicks through an
overlay and do not establish compatibility with physical screen readers.


## Admin Products regression

```sh
pnpm --filter @workspace/glam-me test:storefront-browser admin-products.spec.ts
```

This check is also discovered by the unfiltered browser command. It visits the
real admin route with a browser-only synthetic signed-in Clerk module and an
authorized access response. The initialized catalog contains published and draft
fixtures. It requires the product grid, Add product, View product links and Edit
product buttons, while rejecting any Product Information Review text in the DOM.
No control that changes data is clicked. Unknown API/auth requests, external
requests and all non-read requests are blocked and fail the test. No accounts,
products or business data are created or changed. This fixture checks the Products
presentation, not real Clerk authentication or server-side authorization.

## Product-page responsive geometry

```sh
pnpm --filter @workspace/glam-me test:product-layout
```

This focused suite uses the existing isolated Vite/SSR test harness (port 18784;
override with `PRODUCT_LAYOUT_PORT`). It needs no preview, API, credentials or
live catalog. Client-only catalog fixtures provide one single-image product and
one eight-image product; decoded portrait SVGs are local, deterministic test
media. Unexpected API/external requests and all writes are blocked and fail.

Both products resize in the same mounted page through 1280, 1024, 820, 768, 393,
820 and 1280px. Geometry assertions protect the single H1/category above the
gallery, left-aligned 60%-width/capped 480px 3:4 tablet frame, thumbnail rail clearance
from viewer/purchase form, phone full-width/original-ratio photos, and desktop
side-by-side/original-ratio photos. The rail is intentionally hidden at 768px
(the existing 800px breakpoint). The multi-image case selects a second image at
every size, checks loading and descriptive alt text, then returns to the first.
Image and thumbnail decoding, page overflow and absence of single-image
thumbnails are also checked. No business data is saved.
Negative controls temporarily inject six broken CSS rules in the disposable
browser and require the corresponding geometry assertion to reject each one.
The left alignment follows the merchant's newer approval on the main branch,
which supersedes the original centered-tablet layout requested for this suite.

This is layout regression coverage, not gallery persistence, general public-page
release automation, SSR/hydration coverage, or authentication testing. Failures
retain screenshots/traces in ignored `generated-artifacts/product-layout-tests`.

## Private receipt and checkout-dialog contrast

`private-contrast.spec.ts` is automatically included by the existing
`test:storefront-browser` entry point. To run only these focused checks:

```sh
pnpm --filter @workspace/glam-me test:storefront-browser private-contrast.spec.ts
```

These checks visit the real `/order-confirmation` route with mocked owned-order
finalization responses: confirmed, account created/existing/pending, confirmation
error, confirming/missing reference, and all refund/manual-resolution presentations.
They also open the real Clerk modal from checkout using a synthetic signed-out
Frontend API client/environment (including Google and password sign-in). The
customer-facing fixture omits Clerk's developer-only warning; it does not omit
any customer text from contrast measurement. Clerk's static SDK resources must
still be available, but no real authentication, order, payment, or password
mutation is sent. Unknown API calls fail the test and are blocked.

The shared measurement helper reads actual computed colors, composites transparent
backgrounds through the ancestor chain, and requires **4.5:1 for every visible text
sample**, even headings. It checks default, settled hover, and keyboard
`:focus-visible` states separately, including account action links/buttons.
Unknown paint effects fail explicitly. Negative controls restore the old
white-on-light-pink receipt/modal foregrounds and prove the measurement rejects
them. No exact production palette values are asserted. These are focused client
state checks, not additional public layout, hydration, or release tests.

The receipt fixtures also assert item, subtotal, delivery, discount, VAT and final
amounts in pounds from saved pence values, with EUR and invalid-currency fallback
checks. The existing `launch.spec.ts` contrast checks reuse the same computed-color
helper for shared action buttons. A stylesheet fixture covers the shared admin
button classes without requiring admin access or performing admin actions.
## Promotional photo contrast

```sh
pnpm --filter @workspace/glam-me exec playwright test test/promotional-photo-contrast.spec.ts
```

This read-only suite is an exception to the fixture-based tests below: it uses
the running development shop's current catalog and actual merchant images.
Ensure its homepage has featured categories and moment products selected.
It never edits settings, products, or orders.

The 18 cases cover the home hero, every featured collection tile and moment
card, About hero/CTA, and FAQ hero, at 1440px and 390px widths. Each runs with
real loaded photos, all-white replacements (worst-case bright crops), and
aborted image requests (including CSS backgrounds). Screenshots retain the
visible text for visual inspection. Separate background captures temporarily
hide glyphs/shadows without changing layout, then sample pixels across each
text box and require at least 4.5:1 contrast, including headings. Checks also
reject clipped text boxes and text below 14px. Test attachments contain
per-element contrast readings; screenshots go to the ignored test output
directory. This is not a generic layout, hydration, or purchase-flow suite.

Before the merchant's homepage styling restoration on 2026-10-14, all 18 cases
passed against the development catalog; desktop hero and mobile photo crops
were also visually inspected. The work
keeps accent/button palettes and product/purchase behavior unchanged. This
does not establish contrast for future new photo surfaces or altered overlays;
include them in this suite when adding them.

The homepage now deliberately uses its previous lighter banner overlay and
unboxed collection/moment copy. The earlier all-pass result does not apply to
these restored surfaces, particularly with bright replacement photos. Preserve
the contrast assertions: report failures rather than lowering thresholds or
silently reintroducing the darker homepage treatment. About and FAQ retain their
contrast protections.

Every test has a fresh browser context. Catalog, inventory, shipping, return policies and payment configuration are intercepted with explicit test fixtures; fixture text is not business-approved content and is never saved to the shop. The suite does not make payments or edit business data. Results go to ignored `generated-artifacts/storefront-tests`.

### Real signed-out Clerk widgets

```sh
STOREFRONT_BASE_URL=https://your-development-preview pnpm --filter @workspace/glam-me exec playwright test test/clerk-ui.spec.ts
```

Unlike the catalog fixtures, `clerk-ui.spec.ts` loads the configured development
Clerk widgets without mocking authentication. It checks account, registration
and admin gates, heading semantics, the approved auth palette, keyboard focus,
editable email fields and account/register navigation. It also rejects the
structural-CSS warning and remote UI-script loading. It never submits credentials,
creates users, sends emails or starts OAuth. Run this after deliberately updating
the exact `@clerk/ui` version; do not replace its pin with a floating range.

These fixture-based browser tests explicitly remove the document's initial public
snapshot to exercise client-only loading and failure recovery. They do not test
server rendering. Run `PORT=18781 BASE_PATH=/ pnpm --filter @workspace/glam-me test:ssr`
for production-template and initial-HTTP checks.

The tests cover delayed/error/retry/uninitialized/empty catalogs; persisted bag identifiers; Simple and selected Variable pricing; unavailable saved variants; product gallery and guest wishlist; deliberately empty home selections; category promotion and stable empty routes; policy consistency and unavailable content; and mobile keyboard/focus/search/route/viewport behavior.

## Server-rendered public pages (release regression gate)

From the workspace root:

```sh
pnpm --filter @workspace/glam-me test:ssr-browser
```

This first runs the existing `test:ssr` production build and HTTP checks, then
starts two isolated local servers: real Vite development middleware on port 18782
and the production document/static server on port 18783. It does **not** reuse
the running preview or API workflows. Override occupied ports with `SSR_DEV_PORT`
and `SSR_PROD_PORT`; existing listeners are never reused or stopped.

Both servers use the same read-only catalog/stock/policy fixtures as the HTTP
checks in `server/public-ssr.fixtures.mjs`. Unlike `storefront.spec.ts`, the new
`public-ssr.spec.ts` never strips the server snapshot or rewrites documents.
Styles, fonts, built responsive hero images and JavaScript come from the real
app; fixture category/product images are served over HTTP. The auth provider
uses a fictional key and a signed-out browser SDK fixture, so these tests need
no credentials, API, database, payments, emails or external services. They are
not a substitute for signed-in heading, wishlist or real auth tests.

Coverage in **both serving modes**:

- JavaScript off at desktop (1440px) and mobile (390px): direct home, shop,
  category directory, category detail and product visits; visible headings,
  header/footer, computed CSS, viewport overflow, actual image decoding and
  stylesheet/image request failures.
- JavaScript off: ordinary home → shop → product → category link clicks.
- JavaScript on: direct visits to each public template with the original SSR
  snapshot; console/page errors including hydration mismatches fail the test.
  A browser-only bag count proves hydration finished, product options/add-to-bag
  prove event handlers work, and each template navigates to the client-only bag
  with correct variant pricing.
- Noindex headers/meta and an empty sitemap stay required.

Every test gets a fresh browser context; only disposable local bag state changes.
Browser writes are rejected, and the fixture server rejects non-GET/HEAD requests.
Failures include screenshots and traces under ignored
`generated-artifacts/ssr-browser-tests`. There are no pixel baselines to update:
layout assertions check visible structure, styling, dimensions and overflow.

To narrow a run while keeping the build/HTTP gate:

```sh
pnpm --filter @workspace/glam-me test:ssr-browser --project=ssr-production
pnpm --filter @workspace/glam-me test:ssr-browser --project=ssr-development --grep="without JavaScript"
```

For iteration **only after a successful build/HTTP gate from this command**,
run `pnpm --filter @workspace/glam-me exec playwright test --config playwright.ssr.config.ts`.
The direct Playwright invocation does not rebuild production output; use the full
command for release checks. The full command builds with a fictional auth key;
do not deploy that test build. Rebuild normally before any production release.

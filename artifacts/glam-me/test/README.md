# Storefront launch regression checks

From the workspace root:

```sh
pnpm --filter @workspace/glam-me test:storefront
STOREFRONT_BASE_URL=https://your-development-preview pnpm --filter @workspace/glam-me test:storefront-browser
```

The browser suite uses `@playwright/test` and automatically uses Replit's Chromium when available. Outside Replit, provision Playwright's Chromium browser in your test environment, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing compatible Chromium executable. Both the frontend and API workflows must be running (the API also serves Clerk's development proxy).

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

Verified on 2026-10-14: all 18 cases passed against the development catalog;
desktop hero and mobile photo crops were also visually inspected. The work
keeps accent/button palettes and product/purchase behavior unchanged. This
does not establish contrast for future new photo surfaces or altered overlays;
include them in this suite when adding them.

Every test has a fresh browser context. Catalog, inventory, shipping, return policies and payment configuration are intercepted with explicit test fixtures; fixture text is not business-approved content and is never saved to the shop. The suite does not make payments or edit business data. Results go to ignored `generated-artifacts/storefront-tests`.

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

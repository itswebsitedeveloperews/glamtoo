# Storefront launch regression checks

From the workspace root:

```sh
pnpm --filter @workspace/glam-me test:storefront
STOREFRONT_BASE_URL=https://your-development-preview pnpm --filter @workspace/glam-me test:storefront-browser
```

The browser suite uses `@playwright/test` and automatically uses Replit's Chromium when available. Outside Replit, provision Playwright's Chromium browser in your test environment, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing compatible Chromium executable. Both the frontend and API workflows must be running (the API also serves Clerk's development proxy).

Every test has a fresh browser context. Catalog, inventory, shipping, return policies and payment configuration are intercepted with explicit test fixtures; fixture text is not business-approved content and is never saved to the shop. The suite does not make payments or edit business data. Results go to ignored `generated-artifacts/storefront-tests`.

These fixture-based browser tests explicitly remove the document's initial public
snapshot to exercise client-only loading and failure recovery. They do not test
server rendering. Run `PORT=18781 BASE_PATH=/ pnpm --filter @workspace/glam-me test:ssr`
for production-template and initial-HTTP checks; see `docs/public-page-rendering.md`
for the separate no-JavaScript and hydration browser checks.

The tests cover delayed/error/retry/uninitialized/empty catalogs; persisted bag identifiers; Simple and selected Variable pricing; unavailable saved variants; product gallery and guest wishlist; deliberately empty home selections; category promotion and stable empty routes; policy consistency and unavailable content; and mobile keyboard/focus/search/route/viewport behavior.

# Public page rendering

Home, shop, the category index, individual categories, products, About, FAQ,
Contact, Privacy, Terms and Returns render their existing React components into
the initial document. This is the same response
for people and crawlers; there is no user-agent branching or hidden SEO copy.
Private routes retain their client-only mount.

## Data and hydration

The web server fetches the public catalog, current inventory and paid-unit sales
endpoints without forwarding cookies or authorization for catalog templates.
Informational pages do not require the catalog; their navigation refreshes after
hydration. FAQ, Returns and product templates also load current public delivery
and return settings into the shared snapshot. Published products,
categories, homepage curation, stock and sales are serialized as escaped JSON.
The same snapshot initializes the browser before `hydrateRoot`. Catalog refresh,
stock refresh, wishlist initialization and saved bag counts run after hydration.
No browser storage or account data is read by the document server.

Existing product normalization, in-stock variation pricing, filtering, sorting,
pagination and URL construction stay in the storefront components. Explicitly
empty homepage selections remain empty. The snapshot is not a permanent cache:
every document request obtains current public data, and the browser retains its
existing refresh paths. Data failures produce a non-cacheable HTTP 503 rather
than a successful document containing demo or unverified catalog data.

The existing SEO resolver still handles redirects and not-found statuses before
rendering. Site-wide **noindex** and the **empty sitemap** remain in effect.
Rendering public content does not authorize enabling indexing.

## Build and serving

`pnpm --filter @workspace/glam-me build` builds both client assets and the server
entry. The existing Node document server imports that entry. Development uses
Vite's server module loader. Both rendering targets use identical public image
URLs; SSR must not emit filesystem URLs in HTML.
The stylesheet is linked directly from the HTML document, rather than imported
only by the JavaScript entry, so development also stays styled without JavaScript.

The storefront currently keeps catalog state at module scope. The server entry
sets the public snapshot, calls synchronous `renderToString`, and resets it in a
`finally` block. Do not add asynchronous or streaming rendering inside that
section without first replacing module state with request-local context.

## Checks

- `pnpm --filter @workspace/glam-me typecheck`
- `pnpm --filter @workspace/glam-me test:seo`
- `pnpm --filter @workspace/glam-me test:storefront`
- `PORT=18781 BASE_PATH=/ pnpm --filter @workspace/glam-me test:ssr`

The SSR integration check builds production output first and checks real public
templates, current stock overrides, variable prices, query routes and isolation
between successive requests. HTTP tests cover safe serialization, private-route
exclusion, API failures, redirects, headers and unchanged discovery policy.

For browser checks, verify direct public visits with JavaScript disabled, then
enable JavaScript and check hydration, filters, product options and adding to the
bag. Browser-only API mocks do not change an already server-rendered snapshot;
tests simulating an absent initial catalog must explicitly use the client-only
fallback shell or supply a server-side catalog fixture.

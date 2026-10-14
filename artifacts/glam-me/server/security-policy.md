# Storefront indexing and browser policy

The entire website remains **noindex** in HTTP headers, initial HTML and browser
navigation. Public crawling is allowed so crawlers can discover that instruction.
Neither robots.txt nor the empty sitemap advertises pages for indexing. This does
not guarantee immediate removal of previously indexed pages.

## Enforced

- `X-Robots-Tag: noindex, follow`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- A complete enforced CSP restricts scripts, connections, frames, images, styles,
  fonts, workers, media, objects, base URLs and forms.
- Production frame ancestors are `'self'`; development additionally permits
  `https://replit.com https://*.replit.dev` for workspace preview.

Frame protection rejects cross-origin production embedding and permits the
workspace's development preview. X-Frame-Options is deliberately omitted because
SAMEORIGIN/DENY would conflict with that development preview allowance.

## Enforced Content Security Policy

The full resource policy is sent as `Content-Security-Policy`, not
`Content-Security-Policy-Report-Only`. Production scripts have neither
`'unsafe-inline'` nor `'unsafe-eval'`. Exact initial inline script contents are
hashed. Styles retain inline permission because Clerk/Stripe and React need it.
Violations appear in the browser console; there is no stored historical reporting
endpoint and no external reporting service receiving customer data.

Dependencies represented in the candidate:

- Clerk: same-origin proxy, exact tenant hosts derived from configured public
  keys and the verified site origin (never arbitrary request Host headers).
  Protection scripts/frames use `*.protect.clerk.com`; protection connections
  retain the vendor-required `:*` for non-standard ports. Clerk telemetry and
  Cloudflare challenge hosts remain explicitly permitted.
- Stripe: js.stripe.com and *.js.stripe.com SDK/script/frame hosts, api.stripe.com
  connections, hooks.stripe.com authentication and checkout.stripe.com frames,
  and existing Stripe telemetry connections. No generic HTTPS script/frame
  wildcard was added. The current interface mounts Card Element. Other Stripe
  integrations require review of their matching vendor directives before adoption.
- Catalog: same-origin assets and object-storage proxy, HTTPS image URLs supplied
  by admins, existing data/blob uploads. HTTPS image permission is intentional,
  not a script or connection wildcard.
- Fonts are self-hosted. Unused Google Fonts CSS/gstatic sources were removed.
- Development: Vite/React Refresh inline code, overlay eval and WebSocket HMR.
  Production omits eval/inline script permission and hashes initial inline scripts.

HTTP tests validate complete enforced policies on production/development
documents, HEAD, aliases, fallbacks and runtime bypass. Source tests check exact
Clerk origin validation, required provider directives, script hashes and isolated
development exceptions. Native Chromium checks proved that trusted scripts and
same-origin fetches run while injected scripts, eval, unapproved connections,
frames, HTTP images, external forms and base URLs are blocked. The controlled
external test server received zero requests.

### Browser compatibility and remaining coverage

A fresh baseline sign-in browser capture found no violations. Compatibility
checks must attribute events to their owning document and distinguish the
parent policy from third-party iframe policies. Do not broaden parent directives
to silence warnings emitted inside Stripe-controlled documents.

A direct browser check applied the actual production policy to initial preview
documents, hashing their original inline scripts rather than permitting inline
scripts/eval. Clerk sign-in, signup and recovery screens rendered, and a populated
guest checkout mounted Stripe card frames, with zero unexpected parent-document
violations. Development Vite WebSocket attempts were blocked by the production
connection policy and excluded as expected test-harness traffic. Vendor iframe
policies were not overridden. This used the development Clerk tenant, not the live
production tenant.

No recovery messages or payments are submitted by these checks. Saved-card
confirmation, actual issuer 3DS completion and email-based recovery require a
separate controlled, approved fixture. Frame mounting is not proof that a payment
completed. Live deployment headers also require re-verification after publishing.
The automated signed-in shopper pass did not finish and was stopped; no signed-in
compatibility success is claimed.

Vendor references:
- https://clerk.com/docs/guides/secure/best-practices/csp-headers
- https://docs.stripe.com/security/guide#content-security-policy

Pagination canonical differences are intentional existing behavior: unfiltered
`/shop?page=2` retains `?page=2`; filtered `/shop?sort=new&page=2` canonicalizes to
`/shop`. Global noindex must not change that calculation.

## Structured product offers

Product identity comes from the published catalog. Offers require matching
active checkout inventory prices and current stock; catalog stock alone is not
sufficient. Variable parent prices, unverified offers, conflicting sale prices,
reviews, sizes and merchant claims are omitted rather than invented. If checkout
inventory cannot be read, Product identity remains available without offers.

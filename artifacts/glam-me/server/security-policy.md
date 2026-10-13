# Storefront indexing and browser policy

The entire website remains **noindex** in HTTP headers, initial HTML and browser
navigation. Public crawling is allowed so crawlers can discover that instruction.
Neither robots.txt nor the empty sitemap advertises pages for indexing. This does
not guarantee immediate removal of previously indexed pages.

## Enforced

- `X-Robots-Tag: noindex, follow`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- Production CSP `frame-ancestors 'self'`
- Development CSP adds `https://replit.com https://*.replit.dev` for workspace preview.

Frame protection rejects cross-origin production embedding and permits the
workspace's development preview. X-Frame-Options is deliberately omitted because
SAMEORIGIN/DENY would conflict with that development preview allowance.

## Report-only candidate, not a fully enforced CSP

`Content-Security-Policy-Report-Only` restricts scripts, connections, frames,
styles, images, fonts, workers, media, objects, base URLs and forms.
Violations appear in the browser console; no external reporting endpoint receives
customer data.

Dependencies represented in the candidate:

- Clerk: same-origin proxy (when configured), Clerk account/API/script hosts,
  Cloudflare challenge frames/scripts/connections. External identity providers
  and custom Clerk domains require explicit validation before enforcement.
- Stripe: js.stripe.com Card Element/script/frame, api.stripe.com connections,
  hooks.stripe.com and checkout.stripe.com frames, Stripe telemetry hosts.
  Issuer-hosted 3-D Secure challenges may require additional frame origins.
- Catalog: same-origin assets and object-storage proxy, HTTPS image URLs supplied
  by admins, existing data/blob uploads. HTTPS image permission is intentional,
  not a script or connection wildcard.
- Fonts: Google Fonts CSS and gstatic font files; inline styles support Clerk,
  Stripe and existing React styles.
- Development: Vite/React Refresh inline code, overlay eval and WebSocket HMR.
  Production omits eval/inline script permission and hashes initial inline scripts.

HTTP tests validate production/development documents, headers, HEAD, aliases,
fallbacks and runtime bypass. A fresh browser pass verifies metadata navigation
and inspects third-party loading. Full CSP enforcement must wait for proven
Clerk sign-in/recovery, saved-card and Stripe 3DS compatibility in a controlled
test-mode environment. Do not perform live payments, send recovery emails, or
broaden permissions just to suppress console reports.

### Browser verification and remaining blockers

The fresh-context browser pass confirmed one persistent noindex tag, parsed
Product JSON-LD, removal of product schema/social images on navigation, homepage
social image loading, alias GET/HEAD protection, catalog image loading, embedded
Clerk sign-in/recovery rendering, and Stripe test-mode Card Element mounting.
The browser-head regression test also exercises stale/aborted resolver responses,
network failure, redirects and synchronous removal of previous product metadata.

No recovery messages or payments were submitted. Full Clerk authentication/
recovery completion, saved-card confirmation, and issuer 3DS were not verified:
the pass lacked a controlled signed-in payment fixture. Those checks remain
required before broad CSP enforcement. No full production CSP browser proof is
claimed.

Stripe frame loading produced inline-style violation events from Stripe-related
policies, but the capture did not retain documentURI, so exact iframe attribution
was not established. Card Element mounted; do not weaken the storefront candidate
based on unattributed third-party events. Vite reconnected after reloads; no
blocking page errors were observed.

Pagination canonical differences are intentional existing behavior: unfiltered
`/shop?page=2` retains `?page=2`; filtered `/shop?sort=new&page=2` canonicalizes to
`/shop`. Global noindex must not change that calculation.

## Structured product offers

Product identity comes from the published catalog. Offers require matching
active checkout inventory prices and current stock; catalog stock alone is not
sufficient. Variable parent prices, unverified offers, conflicting sale prices,
reviews, sizes and merchant claims are omitted rather than invented. If checkout
inventory cannot be read, Product identity remains available without offers.

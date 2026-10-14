# Glam Too SEO audit — 14 October 2026

## Confirmed issues fixed

- Distinct titles/descriptions for account, registration, password recovery, bag,
  wishlist, checkout, order confirmation and store administration.
- Recognised account sections have specific metadata without exposing customer
  names, order references, email addresses or other private query values.
- Sign-in/sign-up retain Clerk's real H1 and changing instructions. Welcome copy
  is introductory text; the hidden-heading/fake-title overlay has been removed.
- Server-rendered head and client navigation replace legacy metadata rather than
  accumulating titles, descriptions, canonicals and social tags.
- Valid shop pagination has distinct titles/descriptions and canonical URLs.
- Missing pages retain HTTP 404, noindex/nofollow, no schema and no homepage canonical.
- Public informational/collection pages now emit Organization, WebSite and
  appropriate WebPage/AboutPage/ContactPage/CollectionPage JSON-LD.
- Product schema retains verified checkout prices, currency and stock only.
  Offers identify the actual retailer; no invented ratings, reviews, manufacturer,
  physical address or shipping/return promises have been added.
- Private pages never emit public commerce schema.

## Intentionally preserved

The merchant's pre-launch policy is site-wide **noindex**. Robots allows page
crawling so crawlers can see that directive, excludes API paths, and does not
advertise a sitemap. The XML sitemap is deliberately empty. Slugs, alias redirects,
production-origin canonicals and gallery URLs remain unchanged.

## Verification

Both package type checks and the frontend production build passed. Ten backend
SEO regressions and sixteen web SEO/server regressions passed.
Fifteen initial preview HTTP responses were checked for status, a single
description/title and parseable JSON-LD. Seventeen rendered preview routes covered
Clerk sign-in/signup, recovery, public content, category and product templates,
bag, wishlist and empty checkout. Each had one H1; metadata/canonicals were also
checked across the additional eleven rendered routes.
Authenticated account sections and populated payment checkout were not exercised.
The changed live deployment still needs publication and re-verification.

## Remaining architectural limitation

Initial HTML contains route-specific metadata and JSON-LD, but the visible public
page body is client-rendered. Google can render JavaScript; crawlers that cannot,
or delayed rendering, may miss that content. Full public-page server rendering
is a separate, broader implementation, not silently solved by head metadata.
Do not enable indexing or populate/advertise the sitemap without merchant approval.

## Published-site verification — 14 October 2026, 08:01 UTC

**Status: incomplete; the published site still serves the older SEO behavior.**
This section records fresh production observations, not acceptance of the fixes
listed above. Deployment metadata reported a successful, public deployment at
`https://glamtoo.webdesignessex.io`. Its HTML and resolver output do not yet match
the inspected workspace SEO implementation. No deployment was initiated.


### Observed route matrix

All successful initial responses below returned HTTP 200, one title,
description, canonical and robots meta tag, and `X-Robots-Tag: noindex, follow`.
Public and private pages stayed **noindex** after rendering.

| Route | Rendered H1 / H2 | JSON-LD, initial and rendered | Result |
| --- | --- | --- | --- |
| `/` | 1 / 3 | None | Title, description, canonical and social tags agree; expected public schema is not live. |
| `/shop` | 1 / 0 | None | Correct shop canonical; expected collection schema is not live. |
| `/shop?page=2` | 1 / 0 | None | Page-2 canonical preserved, but title/description duplicate page 1. Public catalog had 15 products, so page 2 is valid. |
| `/category/new-in` | 1 / 1 | None | Category-specific metadata and canonical agree; expected collection schema is not live. |
| `/product/military-style-jacket` | 1 / 1 | One valid Product object | Matching product canonical, social image and GBP offers at £29.99; offer seller metadata from the workspace change is absent. |
| `/cart` | 1 / 0 | None | Generic private metadata rather than the new shopping-bag copy. |
| `/wishlist` | 1 / 1 | None | Generic private metadata rather than wishlist-specific copy. |
| `/checkout` (empty bag) | 1 / 0 | None | Initial checkout canonical changes to `/cart` after the empty-bag navigation; populated checkout not exercised. |
| `/order-confirmation` (no order reference) | 1 / 0 | None | Generic private metadata; no order was accessed. |
| `/register` | 2 / 0 | None | Duplicate H1s remain in the published signup UI. |
| `/account/recovery` | 1 / 0 | None | Generic private metadata rather than recovery-specific copy. |
| `/admin` (unauthenticated gate only) | 1 / 0 | None | Generic private metadata; no admin access attempted. |
| `/account?section=dashboard` | 2 / 1 | None | Anonymous sign-in screen only; not the customer dashboard. |
| `/account?section=orders` | 2 / 1 | None | Anonymous sign-in screen only; not customer orders. |
| `/account?section=addresses` | 2 / 1 | None | Anonymous sign-in screen only; not customer addresses. |
| `/account?section=payment-methods` | 2 / 1 | None | Anonymous sign-in screen only; not saved payment methods. |
| `/account?section=account-details` | 2 / 1 | None | Anonymous sign-in screen only; not customer details. |
| `/seo-audit-missing-page` | 0 / 0 | None | HTTP 404 retained, but canonical incorrectly points home and robots remains noindex/follow rather than the new noindex/nofollow output. |

All five account query routes currently return the same
`Your account and shopping | Glam Too` title and
`Your private Glam Too shopping page.` description, with canonical `/account`.
These are public sign-in results, not signed-in account results. Apart from the
empty-checkout navigation, initial and rendered head values matched across all
18 routes. No duplicate title, description, canonical, or checked social tag
was observed.

Existing-link navigation from the missing page to shop, then account, then bag
updated metadata without accumulating checked tags or public schema. Product
direct-load metadata was checked, but product-to-private schema removal was not
exercised in this pass.

Robots.txt allows crawling and disallows `/api/`, with no sitemap advertisement.
The XML sitemap remains empty. Both preserve the approved policy.
Product JSON-LD was syntactically valid; this pass did not independently compare
offers against checkout inventory or verify media availability.


### Method and safety

- Read-only HTTP requests checked initial HTML, response status, `X-Robots-Tag`,
  the public SEO resolver, robots.txt and sitemap.xml.
- An isolated, anonymous Chromium session checked the rendered DOM after scripts
  and authentication UI settled. It did not use or obtain a customer session.
- Checked counts and values for titles, descriptions, canonicals, robots,
  Open Graph, Twitter metadata and parseable JSON-LD, plus DOM H1/H2 counts.
- No account was created, no role/access was changed, no private customer data
  was collected, and no forms, payments or emails were submitted. Checkout used
  an empty bag; order confirmation used no order reference.


### Remaining acceptance checks

1. Recheck the complete initial/rendered matrix once the updated SEO build is
   actually live. Older live behavior is not evidence that the workspace fixes
   failed. Keep noindex; do not publish from this verification task.
2. Obtain approval and usable access to an **existing customer session**, without
   creating users/admins or requesting passwords, session cookies or tokens in
   chat. Check the real dashboard, orders, addresses, payment methods and account
   details for one H1 and correct metadata during section navigation.
3. Investigate an additional source-level navigation gap before sign-off:
   `CustomerAccountPage` in `artifacts/glam-me/src/App.tsx` keeps its selected
   section in local React state; its navigation buttons do not change the URL.
   `RouteSeo.tsx` listens to location/search, while `seo.ts` selects account copy
   from `?section=`. Consequently, the new resolver's section-specific copy alone
   cannot make real account-button navigation update metadata. This is a source
   finding, not a claim that signed-in production navigation was tested.
4. Confirm product-to-public/private client navigation removes stale product
   JSON-LD/images, alongside the new missing-page output and public JSON-LD.


### Customer-session access follow-up

The user approved the **primary owner** for the existing-session checks.
A subsequent read-only browser access check could not identify an available
authenticated session for that approved customer. It opened only the published
homepage and stopped; no account sections were inspected and no sign-in,
synthetic authentication, token creation or access changes were attempted.
Approval of the account therefore does not yet satisfy the session-access
prerequisite. The signed-in checks above remain unverified, not passed.

A fresh deployment-status check still reported a public successful deployment,
but `/api/seo/resolve?path=%2Faccount%3Fsection%3Dorders` continued returning
the old generic private-page title and description. The updated build remains
an outstanding prerequisite as well.


### Closure at the user's request

The user subsequently asked to mark this task complete rather than keep it on
hold. This closes the task with the partial audit recorded above; it is **not**
SEO acceptance or evidence that the deferred checks passed. No further live
checks were performed at closure. The remaining post-publication matrix,
approved signed-in customer checks and product-to-private navigation checks
remain unverified. Earlier live observations describe the build tested at that
time, not necessarily the current production build. The approved site-wide
noindex policy was not changed.

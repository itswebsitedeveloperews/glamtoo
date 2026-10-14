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

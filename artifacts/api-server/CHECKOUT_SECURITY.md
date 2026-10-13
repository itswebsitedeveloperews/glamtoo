# Checkout and API security configuration

## Trusted browsers and proxies

- Set `TRUSTED_BROWSER_ORIGINS` to a comma-separated list of exact origins (scheme, hostname and optional port), with no paths, wildcard or trailing slash. When absent, the existing explicitly configured `SEO_SITE_ORIGIN` is the sole production origin; an explicit list overrides that default.
- Set `STOREFRONT_ORIGIN` to the canonical shop origin from that list, or retain the existing `SEO_SITE_ORIGIN` fallback. Hosted checkout and Clerk proxy return URLs use this configuration, never arbitrary Host / X-Forwarded-Host headers.
- In development only, the platform-configured `REPLIT_DEV_DOMAIN` origin is also trusted. Production does not infer a public origin from development configuration.
- Set `TRUSTED_PROXY_CIDRS` only to the IPs/CIDRs of the actual ingress proxies. Express then derives client IP and TLS from that trusted chain. With no configuration, forwarding headers are ignored; limits conservatively share the direct socket address. Do not set trust proxy to `true` or trust all Internet addresses.
- Credentialed CORS returns permission only for these exact origins. All unsafe HTTP methods independently reject untrusted Origin (including `null`), even when the browser ignores CORS. Missing-Origin browser requests reporting cross-site or same-site fetches are rejected.
- Missing Origin is allowed for same-origin browser requests and non-browser callers, which still need account authentication or the private guest cookie, plus checkout throttling. This is not a replacement for authentication. Safe GET OAuth callbacks retain their existing state validation.
- Clerk proxy mutations receive the same origin gate before proxying. Stripe's raw-body webhook precedes it and still requires Stripe signature verification. API responses carry nosniff, frame denial and strict-origin-when-cross-origin referrer protection. Storefront document CSP is separate work.

## Checkout attempts

- Card fields configuration establishes the HttpOnly guest cookie before payment creation. API clients must preserve it across requests.
- Send `Idempotency-Key` (16–100 letters/digits/underscores/hyphens) or a body `retryKey` to both embedded and hosted checkout creation. The key is scoped to the authenticated user or private guest owner; it is not ownership proof.
- Unchanged retries reuse the stored order, request snapshot, Stripe payload and Stripe idempotency key. Changing any checkout detail with the same key returns 409. Cancelled checkouts require a new key; already-paid ones must go to order confirmation.
- Guest and authenticated owners can have at most 3 pending attempts. A network address can have at most 10, even across new guest cookies. Expired-but-payable orders still count until Stripe terminal status is confirmed.
- Atomic PostgreSQL counters allow at most 40 attempts per owner and 80 per network per 10-minute window. Retries count toward request throttling but not new reservation bounds. 429 responses include `Retry-After` and explain retrying or resolving an earlier payment without compulsory sign-in.
- Session advisory locks serialize creation across instances. Separate bounded lock pools avoid holding every normal query connection while awaiting provider work. Busy requests return 429 rather than reserving again.
- Reserve inventory and coupons under the stable order ID before contacting Stripe. Transfer allocations to the returned payment ID transactionally. Paid webhooks can settle either reference, including when the browser's creation response was lost.
- Persist the provider account ID/mode and exact creation payload before submission. Do not replay into another account or mode. Uncertain transport failures retain allocations. Scheduled recovery first reattaches interrupted provider creation, then uses the existing Stripe-verified expiry/finalization logic.
- Never recreate an uncertain payment after 23 hours (inside Stripe's 24-hour guaranteed key-retention window). Recovery paginates provider list endpoints to find its order metadata instead. If no payment can be proven, retain capacity and surface recovery guidance rather than guessing. Provider/account changes may require merchant reconciliation.

## Customer identity and verification

Bootstrap-admin email matches require Clerk `verification.status === "verified"` on the matching address, whether primary or secondary. Existing server-owned private `role: "admin"` remains valid. Checks never assign roles.

Saved-card mappings are keyed by Clerk user and Stripe account ID/mode. Retrieve mapped customers directly and verify their Clerk metadata before using them. Legacy lookup paginates standard list APIs (not regional Search or email matching). First creation is serialized and uses a stable Stripe key; mutable billing information is updated afterwards.

## Isolated verification

Run `pnpm --filter @workspace/api-server test:isolated`. It creates a disposable test database, applies the declared schema, runs mocked-provider/guest/order/coupon/email regression suites, and drops the database on exit. It copies no application data and does not charge cards, create live users or send email. The development database user must have permission to create/drop a test database.

Rebuild database declarations with `pnpm exec tsc -b lib/db` before dependent TypeScript checks. Schema changes use the existing development/post-merge Drizzle flow; no startup or production migration script is introduced.

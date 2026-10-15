# Glam Too launch-readiness evidence

For the seven findings in the 14 October fresh regression report, see
[Fresh launch regressions](fresh-launch-regressions.md). That record separates
source/build fixes from pending inbox receipt, screen-reader confirmation,
merchant wording approval and authorized orphan cleanup. It does not authorize
deployment or unrestricted email sending.

Checked 2026-10-14 UTC (the supplied review is dated 2026-10-13).
**Engineering checks are not store launch approval.** No production deployment,
production migration, live charge, real provider account creation, outbound
email, unrestricted recipient rollout or historical replay was authorized or
performed by this validation.

The uploaded HTML report is historical evidence, not proof of the current
deployment, current advisory counts or an exploitable application vulnerability.
Its Windows Rollup failure does not establish a Linux build failure.

## Repeatable Linux check

```sh
# Linux x64 glibc, non-root user, Node 24.12+ (24.x), pnpm 10.26.1,
# PostgreSQL 16 initdb/pg_ctl available on PATH:
pnpm validate:linux > generated-artifacts/readiness/linux-validation.log 2>&1
```

Create the output directory first on a fresh checkout:
`mkdir -p generated-artifacts/readiness`.

`scripts/validate-linux.mjs` copies build inputs to a fresh temporary tree,
excludes dependencies/build outputs/declarations caches and .env files, and
uses an allowlisted child environment rather than inherited application
credentials. It executes:

1. `pnpm install --frozen-lockfile` (including dev/build dependencies).
2. `pnpm run typecheck` — composite library declaration rebuild, then every
   artifact and scripts package.
3. `pnpm --filter @workspace/api-server run build` with
   `NODE_ENV=production PORT=8080 BASE_PATH=/api`.
4. `pnpm --filter @workspace/glam-me run build` with
   `NODE_ENV=production PORT=5173 BASE_PATH=/`.
5. `pnpm --filter @workspace/mockup-sandbox run build` with
   `NODE_ENV=production PORT=5174 BASE_PATH=/__mockup/`.
6. `pnpm --filter @workspace/glam-me run test:seo`,
   `pnpm --filter @workspace/glam-me run test:storefront`, and
   `pnpm --filter @workspace/shipping run test`.
7. An owned, temporary PostgreSQL cluster listening only on loopback and a
   private temporary Unix socket directory. It creates a random disposable
   database, applies schema **only there**, then runs API suites serially:
   regressions, guest-checkout, checkout-safety, email-confirmations,
   gmail-smtp, gmail-oauth and shipping.
8. Drops the test database, stops PostgreSQL and deletes the temporary tree.
   The storefront build is retained under ignored
   `generated-artifacts/readiness/linux/storefront-build`.

Missing PostgreSQL tools or an explicit disposable database is a **BLOCKED**
failure, not a skipped/passing backend check. The backend runner no longer
falls back to `DATABASE_URL`. To use an independently provisioned local test
cluster, set `TEST_DATABASE_ADMIN_URL` securely and run
`pnpm --filter @workspace/api-server test:isolated`; that cluster must be
disposable, loopback-only, and never a tunnel to production. Prefer the automatic
validator, which owns the entire cluster. Database URLs must not be put in chat
or committed files.

The normal application API entry point is **not started** by validation: its
startup can initialize Stripe migrations, register a webhook, perform a backfill,
recover payments and start email workers. Building it does not invoke those
actions. A build here is not evidence of published configuration or provider
connectivity.

### Observed results

Linux x64, Node test/build runtime 24.13.0, pnpm 10.26.1 (its Nix launcher uses
Node 24.12.0), PostgreSQL 16.10. Final full run: **134 tests passed**, none
failed or skipped. Lockfile SHA256:
`c25610ab288dfaec1a32dccef92ba50b96b35281f49110d5803b79f837d54873`.

| Check | Result |
| --- | --- |
| Frozen install in clean tree | PASS |
| Library declaration rebuild and complete workspace typecheck | PASS |
| API, storefront and component-preview production builds | PASS |
| SEO HTTP/security/browser-metadata and provider contracts | 12 PASS |
| Pricing, stable category slugs, collection truth and content-gap tests | 11 PASS |
| Shared shipping calculations | 15 PASS |
| API regression/SEO/admin/wishlist/finalization/refunds | 27 PASS |
| Guest checkout and account opt-in (fake Clerk/Stripe) | 11 PASS |
| Checkout retry/ownership/concurrency/coupon/CORS safety (fake providers) | 21 PASS |
| Order email policy/outbox/acceptance simulations | 12 PASS |
| Gmail SMTP failure/ambiguity simulations | 9 PASS |
| Gmail OAuth/authorization simulations | 11 PASS |
| Database-backed configured shipping | 5 PASS |
| Missing test-database configuration | Correctly refuses to run with BLOCKED |

The three provider contracts are included in `test:seo`;
they check SDK exports, single script insertion, shared loading and explicit
load failures without contacting either provider. They are not real sign-in,
card-frame, saved-card or 3-D Secure verification.

After restarting only the storefront workflow, a read-only preview capture of
`/account` displayed the embedded Clerk sign-in form. No form was submitted.
This is rendering evidence only: the API workflow was intentionally not started
because of its startup side effects, and the capture logged unavailable API/SEO
responses (502/503). It is not an authenticated journey or a healthy full-stack
preview check. Clerk also warns that existing structural CSS selectors depend on
its remotely served UI DOM; real auth compatibility remains a staging gate.

The clean-tree SEO test initially hung during Vite dependency optimization; its
HTTP-only fixture now disables dependency discovery/prebundling and has a bounded
test timeout. The full production builds still exercise normal bundling.

Warnings remain: the storefront's main JS chunk exceeds Vite's 500 kB warning
threshold; some images are large; upstream recharts/node-domexception/uuid are
deprecated; `@clerk/shared@3.48.0` has an unapproved install script. No install-script
allowlist was expanded. These are not failed builds or proof of vulnerabilities.
Performance and real provider/browser compatibility are not certified here.

## GT-10: current dependency audit

Reproduce from the workspace root (advisories intentionally give nonzero exit
status; retain that status in CI rather than treating it as an install failure):

```sh
pnpm audit --json > generated-artifacts/readiness/audit-full.json
pnpm audit --prod --json > generated-artifacts/readiness/audit-prod.json
pnpm why -r fast-uri brace-expansion js-yaml nanoid markdown-it source-map-js fast-copy
```

Historical audit before the earlier compatible updates: **21** advisories (14 high, 6 moderate, 1 low).
After compatible updates: **4** (1 high, 2 moderate, 1 low).
Production-only: **2** both before and after (1 high, 1 moderate).
These are advisory counts, not exploitable-vulnerability counts.

`pnpm update -r` stayed within declared ranges (no `--latest`, no blind major
upgrades); the one-day package release quarantine remains enabled. The lockfile
and direct/catalog lower bounds were updated together.

### Resolved paths (17 advisory IDs)

All of these are build/codegen tooling, not executable storefront JS:

| Updated resolved path | Before → after | Advisory IDs |
| --- | --- | --- |
| Orval → Scalar parser → AJV → fast-uri | 3.1.4 → 3.1.8 | GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3, GHSA-hrr3-gc8f-f4qj |
| Orval → TypeDoc → minimatch → brace-expansion | 5.0.8 → 5.0.12 | GHSA-rgw5-rvv9-x895, GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p |
| Orval → js-yaml | 4.3.0 → 4.3.2 | GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh |
| Vite → PostCSS → nanoid | 3.3.16 → 3.3.20 | GHSA-2v37-7h3g-55p8 |
| Orval → TypeDoc → markdown-it | 14.3.0 → 14.3.1 | GHSA-253c-mchw-3w2r |
| Tailwind/Vite → source-map-js | 1.2.1 → 1.2.2 | GHSA-68fv-2mgg-jv7q |
| API pino-pretty → fast-copy | 4.0.4 → 4.1.2 | GHSA-jggr-w7fw-pc2j |

Pino-pretty is declared development tooling but is also emitted as an API
logging worker by the production build; its fixed fast-copy path therefore
matters beyond the package classification.

### Subsequent security remediation (2026-10-14)

The fresh dependency scan reported **7** findings (5 high, 1 moderate, 1 low),
including three newer sharp advisories. After the following updates, the fresh
dependency scan reports **0** findings. This supersedes the earlier residual
decisions below; a clean dependency scan is not general launch approval.

| Advisory / severity | Previous path | Remediation |
| --- | --- | --- |
| GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w, high | Storefront image builds and API listing previews → sharp 0.34.5 | Upgrade both direct pins to 0.35.5, including its patched prebuilt native libraries. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | Clerk proxy and Canvas file discovery → micromatch → braces 3.0.3 | No patched braces release. Remove both paths: use httpxy (the same underlying proxy engine) directly and replace fast-glob with tinyglobby. No braces remains in the lockfile. |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), high | @google-cloud/storage → gaxios / teeny-request → uuid 9.0.1 | Override vulnerable UUID versions to 11.1.1, preserving CommonJS support; focused tests resolve through the actual consumers and check v4/v5 and output-buffer guards. |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), low | Build/test tools → esbuild 0.27.3 | Update direct and cross-parent pins to 0.28.2. Linux validation exercises production builds and the existing schema-loader shim; Windows remains outside the supported build platform. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate | Tailwind typography → postcss-selector-parser 6.0.10 | Scope an override to typography for 7.1.6; focused checks cover selector round-trips and a large flat selector. |

The one-day release quarantine is unchanged. The compatibility overrides are
intentional and covered by `scripts/test-dependency-security.mjs` and the Linux
validator. Real Clerk production sign-in and cloud storage access still require
their separate provider verification; local proxy tests use an owned upstream
and invented credentials only.

`--prod` alone is not a browser-exposure audit: most Vite artifact dependencies,
including browser runtimes, are correctly classified as devDependencies because
they are compiled into static assets. The full audit and inspected paths above
cover that blind spot. No current advisory path was identified in executable
storefront runtime modules; that is not a general security guarantee.

Existing overrides are assumptions, not upstream compatibility promises:
the esm-loader→tsx substitution and global esbuild pin predate this work.
Clean declaration/build/schema/test checks passed with them; codegen was not
regenerated, and that does not prove every tool API or unused code path. Native
package removals intentionally target Linux x64 glibc, not Windows, macOS,
ARM or musl.

## GT-01–GT-16 checklist

“Implemented” means current source exists; “verified” below means the named
local/simulated check, never an unapproved provider or business check.

| ID | Current implementation and evidence | Remaining gate |
| --- | --- | --- |
| GT-01 | Verified-email bootstrap admin check and exact private admin role; regression guards + checkout-safety primary/secondary/unverified checks PASS. | Real staging ordinary/admin account isolation and identity settings need authorized accounts. |
| GT-02 | Persistent retry identity, throttling, pending-owner/network bounds and allocation recovery; checkout-safety concurrent/lost-response/restart/expiry/coupon tests PASS. | Real provider sandbox recovery and operational limits remain staging work; no load/penetration claim. |
| GT-03 | Disconnected newsletter form is removed rather than collecting addresses without a provider. Source implemented; production bundle/typecheck PASS. | No subscription service approved or tested. |
| GT-04 | Delivery advice projects configured enabled shipping methods and returns use editable shared content; shipping suites PASS. | Owner approves actual delivery promises, returns window, exclusions and legal text. No business content changed here. |
| GT-05 | Promotions count published category descendants, hide empty promotions and preserve direct routes; storefront truth tests PASS. | Owner curates actual membership and approves New In claims. |
| GT-06 | Explicit catalog loading/error/uninitialized states and cart identifier persistence are implemented; pricing/truth checks PASS, gallery preservation covered by API SEO catalog normalization regression. | Delayed-loading and actual gallery/wishlist UI browser suite exists but was not rerun here. Existing wishlist/gallery regression follow-ups remain separate; no full gallery sign-off claimed. |
| GT-07 | Metadata-based paginated Stripe customer lookup and account mapping; mocked customer-beyond-100/creation/ownership tests PASS. | Provider-backed saved cards and real customer mapping require staging approval. |
| GT-08 | Exact trusted-origin CORS and separate mutation checks; checkout-safety origin tests PASS. | Owner confirms final origin; no hostile live-origin testing performed. |
| GT-09 | Site-wide noindex HTTP/metadata/redirect/fallback checks PASS, empty sitemap/crawl policy verified locally. | Owned by existing **Protect Indexing And Page Metadata** work (`site-wide-noindex`); do not duplicate or enable indexing. Final-host HTTP verification remains access-dependent. |
| GT-10 | Current audit, compatible updates, exposure classification and explicit four-advisory residual register above. | Not zero advisories; track upstream/major-upgrade work and obtain release risk acceptance. |
| GT-11 | Nonblocking product information-gap review is implemented and tested; no invented fit/care/material facts. | Owner approves every published product description, fit, sizing, care, prices, media and stock. |
| GT-12 | Unfulfilled links renamed/removed; delivery route uses current policy components; build/typecheck PASS. | This run did not perform a complete browser link crawl. |
| GT-13 | Menu hook implements Escape, focus management and background inertness. Build/typecheck PASS; existing keyboard browser suite available. | Browser keyboard/real-device coverage not rerun here; no complete WCAG claim. |
| GT-14 | Structured Product data, social image, escaping, referrer/frame policy and report-only integration CSP tested locally. | Same existing indexing/metadata work as GT-09. CSP integration is not fully enforced or provider-verified; real Clerk/Stripe/3DS/media compatibility needs approved staging. |
| GT-15 | Fail-closed email recipient policy and no historical-confirmation enqueue remain intact; simulated order/refund/SMTP/OAuth suites PASS. | All owner/access sign-offs below remain open. SMTP acceptance, Sent folder or mock delivery is not inbox arrival. |
| GT-16 | Clean frozen Linux install, complete types, three production builds and disposable-DB regression suite PASS. | Windows not supported/tested; no production deployment assertion. |

## Owner/access sign-off gates (OPEN unless separately evidenced)

- **Final HTTPS domain and origin:** owner confirms the final origin, API route,
  canonical/social origins, trusted browser origins and order-email public URL.
  Do not infer the final host from development preview domains or historic defaults.
  Do not activate search indexing as part of launch.
- **Business identity/contact details:** owner verifies trading/legal identity,
  postal address, monitored email and telephone; the historic report's telephone
  is not accepted as accurate evidence.
- **Privacy, terms and consent:** owner/legal reviewer approves jurisdiction,
  business identification, processors, retention, customer rights, cookies and
  any newsletter consent wording. Do not generate facts to fill policy gaps.
- **Catalog and returns/delivery:** owner approves authoritative product facts,
  actual prices/stock/media, collection membership, delivery promises and returns
  window/exclusions/refund process. Verify all durable media on the final host.
- **Staging access:** use secure environment/access tools for approved admin and
  ordinary customer accounts, isolated staging database and read-only app/provider
  logs. No account creation or use of production data without separate approval.
- **Payments:** owner confirms intended mode. Keep live activation outside this
  task. With explicit sandbox approval, verify Card Element load, saved cards,
  successful/declined/3-D Secure/abandoned payment, retries, duplicate signed
  callbacks, coupon settlement, stock contention and refund outcomes using test
  objects. Confirm the exact webhook destination and signature secret in secure
  provider configuration; reject invalid signatures and reconcile once. The
  mock signature `isolated-signed` is **not cryptographic verification**.
- **Email:** obtain explicit approval naming recipient inboxes and permitted
  test messages/orders/accounts first. Keep `ORDER_EMAIL_SEND_TO_ALL` false/unset,
  retain exact `ORDER_EMAIL_ALLOWED_RECIPIENTS`, and preserve historical-send
  safeguards. Securely authorize the Gmail mailbox using its existing protected
  OAuth flow; do not replace credentials. Check provider logs and actual receipt
  of clearly labelled order/contact/refund messages at approved inboxes. Record
  Message-ID and redacted evidence without exposing tokens/customer data.
  API acceptance is not actual delivery; do not replay old orders or retry
  ambiguous SMTP acceptance automatically.
- **Operations:** backup and restore procedure, monitoring/alerts, provider logs,
  final-host TLS/HTTP headers and real-device/browser coverage remain unverified.
  Penetration/load testing and comprehensive accessibility certification were
  not performed.

No external transaction, email test or live activation should proceed until
the owner explicitly approves its scope and recipients. These open gates are
intentional access/business blockers, not a claim that engineering validation
has failed or that launch has been approved.

# Uploaded listing-preview preparation

After an authorized catalog save/migration commits, the background worker reads
the committed gallery order and queues only each published product's second
distinct detail photo, when it is an uploaded object. Original references,
bytes, and gallery ordering are never rewritten. Source ACLs must be public
before preparation; every image HTTP request still checks the source ACL,
including persistent-cache hits.

## Limits and recovery

- One worker prepares one source at a time, sequentially at 320/480/640/960px.
  It shares the existing global two-encode/64-pending-request bounds with
  on-demand requests. Source downloads are capped at 25 MiB/30 seconds and
  encoding at 40 million input pixels/10 seconds.
- Each pass claims at most 16 jobs. The worker polls every five seconds,
  reconciles with the current committed catalog, and uses ten-minute database
  leases plus claim tokens to recover interrupted work safely.
- Ready variants persist in App Storage across server restarts. Partially
  prepared variants are reused on retry. Jobs retry automatically with
  exponential backoff, starting at five seconds and capped at one hour.
  Saving the catalog again also makes failed jobs immediately eligible.
- Catalog saves do not wait for queue reconciliation, source downloads or
  encoding. Startup reconciliation repairs missed wake-ups, including a crash
  immediately after a catalog commit. A shopper who arrives before preparation
  finishes still has the existing on-demand path.
- Unpublished/removed alternates are removed from the queue. This does **not**
  delete originals or stored derivatives; retention is managed separately.

## Observe and retry

The worker logs `Listing preview warm-up ready` (attempt, source path, all
supported widths, elapsed time), `Listing preview warm-up failed; retry
scheduled` (error, attempt, retry delay), or a queue-unavailable error. The
`listing_preview_warmups` table retains state, attempts, next attempt time,
last error class, and update time; an error is never recorded as readiness.
The error class is stored rather than arbitrary provider error text.

To retry without waiting, an authorized admin can save the catalog again.
No public warm-up endpoint accepts arbitrary URLs or private paths. No new
permission or public storage ACL is granted by the worker.

## Verification and measured first-shopper performance

Run the isolated `listing-preview-warmup` backend suite to exercise queue
persistence, partial failures, automatic backoff, expired leases, explicit
retry, gallery selection, and source authorization after preparation.
`test:listing-preview` covers encoding and persistent-cache behavior.

Development-preview HTTP measurements on 2026-10-14 used two fresh temporary
copies of a real published 128,216-byte catalog upload. Each width was requested
for the first time at its unique URL; the prepared copy was warmed using the
same preparation function before any HTTP request. There was no browser cache
or in-memory retained preview buffer:

| Width | On-demand first request | Prepared first request |
| --- | --- | --- |
| 320 | 4,237 ms | 2,877 ms |
| 480 | 4,725 ms | 2,802 ms |
| 640 | 4,914 ms | 2,891 ms |
| 960 | 5,167 ms | 2,979 ms |

All requests returned HTTP 200/WebP with identical bytes per size. Background
preparation took 15,549 ms. Temporary source copies and generated derivatives
were deleted afterward; neither the catalog nor the original was changed.
These are development-network observations for one real image, not production
PageSpeed results or a latency guarantee. Source ACL/metadata checks and
App Storage reads still contribute to the prepared request time.

The repeatable harness is `scripts/measure-listing-preview-warmup.ts`; run the
commands in its header from the workspace root. It writes raw timing evidence
under the ignored `generated-artifacts/` directory.

import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { getObjectAclPolicy } from "./objectAcl";
import { ObjectStorageService } from "./objectStorage";
import { getListingPreview, listingPreviewVersion, listingPreviewWidths } from "./listingPreview";
import { logger } from "./logger";

const storage = new ObjectStorageService();
let running = false;
let requested = false;
let retryFailed = false;
let started = false;
let tableReady: Promise<unknown> | undefined;

/** Matches the storefront's primary-first, deduplicated detail gallery. */
export function publishedListingAlternates(products: Array<Record<string, unknown>>): string[] {
  const paths = new Set<string>();
  for (const product of products) {
    if (product.status !== "Published") continue;
    const primary = typeof product.image === "string" ? product.image.trim() : "";
    const gallery = Array.isArray(product.galleryImages)
      ? product.galleryImages.filter((item): item is string => typeof item === "string")
        .map(item => item.trim()).filter(Boolean) : [];
    const alternate = [...new Set([primary, ...gallery].filter(Boolean))][1];
    if (alternate && /^\/objects\/uploads\/[0-9a-f-]{36}$/.test(alternate)) paths.add(alternate);
  }
  return [...paths];
}

export const previewRetryDelayMs = (attempt: number) => Math.min(3_600_000, 5_000 * 2 ** Math.min(attempt - 1, 10));

export async function warmPublishedListingAlternate(path: string) {
  const file = await storage.getObjectEntityFile(path);
  // Never warm drafts/private uploads. Serving also independently rechecks ACL,
  // including when a previously published image has since been made private.
  if ((await getObjectAclPolicy(file))?.visibility !== "public") {
    throw new Error("Listing preview source is no longer public.");
  }
  for (const width of listingPreviewWidths) await getListingPreview(file, width);
}

async function reconcile(resetFailures: boolean) {
  tableReady ??= pool.query(`CREATE TABLE IF NOT EXISTS listing_preview_warmups (
    source_path text PRIMARY KEY,
    version text NOT NULL,
    state text NOT NULL DEFAULT 'queued',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
    lease_token text,
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT NOW()
  )`).catch(error => { tableReady = undefined; throw error; });
  await tableReady;
  // Read only committed catalog state; startup also repairs a crash between
  // catalog COMMIT and the in-process wake-up. No image work runs in a save.
  const exists = await pool.query("SELECT to_regclass('store_catalog') AS catalog");
  if (!exists.rows[0]?.catalog) return;
  const { rows } = await pool.query("SELECT products FROM store_catalog WHERE id = 1");
  const paths = publishedListingAlternates(rows[0]?.products ?? []);
  await pool.query(`INSERT INTO listing_preview_warmups (source_path, version)
    SELECT unnest($1::text[]), $2
    ON CONFLICT (source_path) DO UPDATE SET
      version = EXCLUDED.version, state = 'queued', attempts = 0,
      next_attempt_at = NOW(), lease_token = NULL, last_error = NULL, updated_at = NOW()
    WHERE listing_preview_warmups.version <> EXCLUDED.version
      OR ($3 AND listing_preview_warmups.state = 'failed')`,
  [paths, listingPreviewVersion, resetFailures]);
  // Retire obsolete queue records, not stored images/derivatives.
  await pool.query("DELETE FROM listing_preview_warmups WHERE NOT (source_path = ANY($1::text[]))", [paths]);
}

export async function runListingPreviewWarmupPass() {
  if (running) return;
  running = true;
  try {
    do {
      requested = false;
      const reset = retryFailed;
      retryFailed = false;
      await reconcile(reset);
      // Bound each pass and use a database lease for restart/multi-instance safety.
      for (let count = 0; count < 16; count++) {
        const token = randomUUID();
        const { rows } = await pool.query(`UPDATE listing_preview_warmups SET
          state = 'working', lease_token = $1, attempts = attempts + 1,
          next_attempt_at = NOW() + INTERVAL '10 minutes', updated_at = NOW()
          WHERE source_path = (
            SELECT source_path FROM listing_preview_warmups
            WHERE state <> 'ready' AND next_attempt_at <= NOW()
            ORDER BY next_attempt_at, source_path LIMIT 1 FOR UPDATE SKIP LOCKED
          ) RETURNING source_path, attempts`, [token]);
        const job = rows[0];
        if (!job) break;
        const start = performance.now();
        try {
          await warmPublishedListingAlternate(job.source_path);
          await pool.query(`UPDATE listing_preview_warmups SET state = 'ready',
            lease_token = NULL, last_error = NULL, updated_at = NOW()
            WHERE source_path = $1 AND lease_token = $2`, [job.source_path, token]);
          logger.info({ sourcePath: job.source_path, attempt: job.attempts, durationMs: Math.round(performance.now() - start), widths: listingPreviewWidths }, "Listing preview warm-up ready");
        } catch (error) {
          await pool.query(`UPDATE listing_preview_warmups SET state = 'failed',
            next_attempt_at = NOW() + ($3 * INTERVAL '1 millisecond'),
            lease_token = NULL, last_error = $4, updated_at = NOW()
            WHERE source_path = $1 AND lease_token = $2`,
          [job.source_path, token, previewRetryDelayMs(job.attempts), error instanceof Error ? error.name : "UnknownError"]);
          logger.warn({ sourcePath: job.source_path, attempt: job.attempts, err: error, retryInMs: previewRetryDelayMs(job.attempts) }, "Listing preview warm-up failed; retry scheduled");
        }
      }
    } while (requested);
  } catch (error) {
    logger.error({ err: error }, "Listing preview warm-up queue unavailable; will retry");
  } finally {
    running = false;
  }
}

/** Fire-and-forget only after an authorized catalog transaction commits. */
export function requestListingPreviewWarmup() {
  requested = true;
  retryFailed = true;
  setImmediate(() => { void runListingPreviewWarmupPass(); });
}

export function startListingPreviewWarmupWorker() {
  if (started) return;
  started = true;
  // Polling recovers missed wake-ups and expired leases without shopper traffic.
  setInterval(() => { void runListingPreviewWarmupPass(); }, 5_000).unref();
  void runListingPreviewWarmupPass();
}

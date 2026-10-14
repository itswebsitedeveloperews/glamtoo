import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";
import express from "express";
import { pool } from "@workspace/db";
import {
  publishedListingAlternates, previewRetryDelayMs, requestListingPreviewWarmup,
  runListingPreviewWarmupPass, warmPublishedListingAlternate,
} from "../src/lib/listingPreviewWarmup";
import { images, ObjectStorageService } from "./fixtures/listing-storage";
import { getListingPreview, listingPreviewWidths } from "../src/lib/listingPreview";
import storageRouter from "../src/routes/storage";

const path = "/objects/uploads/11111111-1111-4111-8111-111111111111";
const other = "/objects/uploads/22222222-2222-4222-8222-222222222222";
const product = (alternate = path, status = "Published") => ({ image: "primary.jpg", galleryImages: ["primary.jpg", alternate, other], status });
after(async () => { await pool.end(); });

test("published selection preserves gallery order, deduplicates and excludes drafts/external URLs", () => {
  const products = [product(), product(), product(other, "Draft"), product("https://example.com/image.jpg")];
  const before = JSON.stringify(products);
  assert.deepEqual(publishedListingAlternates(products), [path]);
  assert.equal(JSON.stringify(products), before);
  assert.deepEqual(publishedListingAlternates([{ image: "", galleryImages: ["first.jpg", path], status: "Published" }]), [path]);
  assert.equal(previewRetryDelayMs(1), 5000);
  assert.equal(previewRetryDelayMs(1000), 3600000);
});

test("durable queue warms all variants, retries failure, recovers leases, and drops unpublished jobs", async () => {
  const bytes = await sharp({ create: { width: 1400, height: 2100, channels: 3, background: "pink" } }).jpeg().toBuffer();
  images.set(path, { bytes, public: true, downloads: 0, fail: false, stored: new Map() });
  images.set(other, { bytes, public: true, downloads: 0, fail: false, failAtDownload: 2, stored: new Map() });
  await pool.query("INSERT INTO store_catalog (id, products, categories) VALUES (1, $1, '[]') ON CONFLICT (id) DO UPDATE SET products=EXCLUDED.products", [JSON.stringify([product(), product(other)])]);
  await runListingPreviewWarmupPass();
  const states = await pool.query("SELECT * FROM listing_preview_warmups ORDER BY source_path");
  assert.deepEqual(states.rows.map(row => row.state), ["ready", "failed"]);
  assert.equal(images.get(path)!.stored.size, 4);
  assert.equal(images.get(other)!.stored.size, 1, "partial preparation is persisted for retry");
  assert.ok(states.rows[1].last_error);
  assert.ok(new Date(states.rows[1].next_attempt_at).getTime() > Date.now());
  const downloads = images.get(path)!.downloads;
  // A shopper with no in-memory/browser cache reads only persisted variants.
  const file = await new ObjectStorageService().getObjectEntityFile(path);
  for (const width of listingPreviewWidths) {
    assert.equal((await sharp((await getListingPreview(file, width)).bytes).metadata()).width, width);
  }
  assert.equal(images.get(path)!.downloads, downloads);
  await runListingPreviewWarmupPass();
  assert.equal((await pool.query("SELECT attempts FROM listing_preview_warmups WHERE source_path=$1", [other])).rows[0].attempts, 1);
  images.get(other)!.fail = false;
  await pool.query("UPDATE listing_preview_warmups SET state='working', lease_token='crashed', next_attempt_at=NOW() - INTERVAL '1 minute' WHERE source_path=$1", [other]);
  await runListingPreviewWarmupPass();
  assert.equal((await pool.query("SELECT state FROM listing_preview_warmups WHERE source_path=$1", [other])).rows[0].state, "ready");
  assert.equal(images.get(other)!.stored.size, 4);
  assert.equal(images.get(other)!.downloads, 5, "retry reuses the already-prepared width");
  const app = express();
  app.use("/api", storageRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/storage${path}?preview=listing-v1&width=320`;
  try {
    assert.equal((await fetch(url)).status, 200);
    images.get(path)!.public = false;
    const anonymous = await fetch(url);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(url, { headers: { "x-test-user": "customer" } })).status, 403);
    const admin = await fetch(url, { headers: { "x-test-user": "oauth-admin" } });
    assert.equal(admin.status, 200);
    assert.equal(admin.headers.get("cache-control"), "private, no-store");
    assert.equal((await fetch(url.replace("width=320", "width=100000"))).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  // A private source must fail even if every derivative is already cached.
  await assert.rejects(warmPublishedListingAlternate(path), /no longer public/);
  await pool.query("UPDATE listing_preview_warmups SET state='failed', next_attempt_at=NOW() + INTERVAL '1 hour' WHERE source_path=$1", [other]);
  requestListingPreviewWarmup();
  await runListingPreviewWarmupPass();
  assert.equal((await pool.query("SELECT state FROM listing_preview_warmups WHERE source_path=$1", [other])).rows[0].state, "ready");
  await pool.query("UPDATE store_catalog SET products=$1", [JSON.stringify([product(path, "Draft")])]);
  await runListingPreviewWarmupPass();
  assert.equal((await pool.query("SELECT count(*) FROM listing_preview_warmups")).rows[0].count, "0");
  assert.equal(images.get(path)!.stored.size, 4, "queue retirement must not delete media");
});

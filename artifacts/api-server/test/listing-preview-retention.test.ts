import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import type { Bucket, File, FileMetadata, PreconditionOptions } from "@google-cloud/storage";
import { getListingPreview } from "../src/lib/listingPreview";
import {
  decideListingPreviewRetention, listingPreviewRetentionPolicy, retainListingPreviews,
  type RetentionEntry,
} from "../src/lib/listingPreviewRetention";

const day = 86_400_000;
const now = Date.parse("2026-10-14T12:00:00Z");
const key = (n = 1, version = 1) => `listing-previews/listing-v${version}/${n.toString(16).padStart(64, "0")}.webp`;
const metadata = (days: number): FileMetadata => ({
  timeCreated: new Date(now - days * day).toISOString(),
  updated: new Date(now - days * day).toISOString(),
  contentType: "image/webp", generation: "12345678901234567", metageneration: "1", size: "100",
});

function storage() {
  const records = new Map<string, { metadata: FileMetadata; bytes: Buffer }>();
  const prefixes: string[] = [];
  const deleted: string[] = [];
  let nextGeneration = 100;
  let beforeDelete: ((name: string) => void) | undefined;
  let metadataError: number | undefined;
  let deleteError: number | undefined;
  const error = (code: number) => Object.assign(new Error("Storage failure"), { code });
  const bucket = {
    name: "test-media",
    async getFiles(options: { prefix: string; autoPaginate: boolean; maxResults: number; pageToken?: string }) {
      assert.equal(options.autoPaginate, false);
      assert.equal(options.maxResults, listingPreviewRetentionPolicy.pageSize);
      prefixes.push(options.prefix);
      // Stable name cursors model pagination even while earlier objects are deleted.
      const names = [...records.keys()].filter(name => name.startsWith(options.prefix) &&
        (!options.pageToken || name > options.pageToken)).sort();
      const page = names.slice(0, options.maxResults);
      return [page.map(name => bucket.file(name)), names.length > page.length ? { pageToken: page.at(-1) } : null];
    },
    file(name: string, options?: { preconditionOpts?: PreconditionOptions }) {
      return {
        name, bucket,
        async getMetadata() {
          if (metadataError) throw error(metadataError);
          const record = records.get(name);
          if (!record) throw error(404);
          return [{ ...record.metadata }];
        },
        async download() {
          const record = records.get(name);
          if (!record) throw error(404);
          return [Buffer.from(record.bytes)];
        },
        createReadStream() {
          const record = records.get(name);
          if (!record) throw error(404);
          return Readable.from([record.bytes]);
        },
        async save(bytes: Buffer, saveOptions: { metadata: FileMetadata }) {
          records.set(name, { bytes: Buffer.from(bytes), metadata: {
            ...metadata(0), ...saveOptions.metadata, generation: String(nextGeneration++),
          } });
        },
        async delete() {
          beforeDelete?.(name);
          if (deleteError) throw error(deleteError);
          const record = records.get(name);
          if (!record) throw error(404);
          assert.ok(name.startsWith("listing-previews/"), "never delete originals");
          assert.ok(options?.preconditionOpts, "deletion must be conditional");
          const conditions = options.preconditionOpts;
          if (record.metadata.generation !== conditions.ifGenerationMatch ||
            record.metadata.metageneration !== conditions.ifMetagenerationMatch) throw error(412);
          deleted.push(name);
          records.delete(name);
        },
      };
    },
  };
  return {
    bucket: bucket as unknown as Bucket, records, prefixes, deleted,
    put(name: string, days: number, overrides: FileMetadata = {}) {
      records.set(name, { bytes: Buffer.from("cached"), metadata: { ...metadata(days), ...overrides } });
    },
    race(fn: (name: string) => void) { beforeDelete = fn; },
    failMetadata(code: number) { metadataError = code; },
    failDelete(code: number) { deleteError = code; },
  };
}

test("current and retired grace boundaries use the newest creation/modification timestamp", () => {
  const decide = (days: number, version = 1) => decideListingPreviewRetention(key(1, version), metadata(days), now);
  assert.equal(decide(89.99).eligible, false);
  assert.deepEqual(decide(90), { eligible: true, reason: "current-expired" });
  assert.equal(decide(29.99, 0).eligible, false);
  assert.deepEqual(decide(30, 0), { eligible: true, reason: "retired-expired" });
  assert.equal(decideListingPreviewRetention(key(), { ...metadata(200), updated: metadata(1).updated }, now).eligible, false);
  assert.equal(decideListingPreviewRetention(key(), { ...metadata(1), updated: metadata(200).updated }, now).eligible, false);
  assert.equal(decide(-1).eligible, false);
});

test("only recognizable derivatives with complete metadata can expire; future encoders are protected", () => {
  for (const name of [
    "private/uploads/original", "public/photo.webp", "listing-previews/original.webp",
    "listing-previews/listing-v1/not-a-cache-key.webp", key().replace(".webp", ".jpg"),
    `listing-previews/listing-v01/${"a".repeat(64)}.webp`, key(1, 2), key(1, 99999999999999999999),
  ]) assert.equal(decideListingPreviewRetention(name, metadata(200), now).eligible, false, name);
  for (const overrides of [
    { generation: undefined }, { generation: "0" }, { metageneration: undefined },
    { contentType: "image/jpeg" }, { timeCreated: undefined }, { updated: "invalid" },
  ]) assert.equal(decideListingPreviewRetention(key(), { ...metadata(200), ...overrides }, now).eligible, false);
});

test("default dry-run reports candidates and bytes without mutating storage; originals never enter the scan", async () => {
  const s = storage();
  s.put("private/uploads/original", 1000);
  s.put("catalog/history.json", 1000);
  s.put(key(1), 90);
  s.put(key(2, 0), 30);
  s.put(key(3), 1);
  s.put(key(4, 2), 200);
  s.put("listing-previews/foreign-image.webp", 200);
  const before = structuredClone([...s.records]);
  const entries: RetentionEntry[] = [];
  const report = await retainListingPreviews([s.bucket], { now, onEntry: entry => entries.push(entry) });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.eligible, 2);
  assert.equal(report.eligibleBytes, 200);
  assert.equal(report.kept, 3);
  assert.equal(report.deleted, 0);
  assert.equal(entries.filter(entry => entry.action === "would-delete").length, 2);
  assert.deepEqual(structuredClone([...s.records]), before);
  assert.deepEqual(s.deleted, []);
  assert.deepEqual(s.prefixes, ["listing-previews/"]);
});

test("apply scans multiple pages and caps deletion attempts globally, including across buckets", async () => {
  const s = storage();
  for (let n = 1; n <= 450; n++) s.put(key(n), n <= 210 ? 1 : 200);
  const second = storage();
  second.put(key(999), 200);
  const report = await retainListingPreviews([s.bucket, second.bucket], { now, apply: true });
  assert.equal(s.prefixes.length, 3);
  assert.equal(report.scanned, 451);
  assert.equal(report.eligible, 241);
  assert.equal(report.deleted, 100);
  assert.equal(report.deletedBytes, 10000);
  assert.equal(report.limited, 141);
  assert.equal(second.deleted.length, 0);
  assert.ok(s.records.has(key(1)), "recent active preview remains");
});

test("concurrent generation/metageneration changes and disappearance skip deletion", async () => {
  for (const race of ["generation", "metageneration", "missing"] as const) {
    const s = storage();
    s.put(key(), 200);
    s.race(name => {
      if (race === "missing") s.records.delete(name);
      else s.records.get(name)!.metadata[race] = "99999999999999999";
    });
    const report = await retainListingPreviews([s.bucket], { now, apply: true });
    assert.equal(report.changedOrMissing, 1);
    assert.equal(report.deleted, 0);
    assert.equal(s.deleted.length, 0);
  }
});

test("metadata/deletion authorization and transport failures abort rather than silently succeeding", async () => {
  for (const stage of ["metadata", "delete"]) {
    const s = storage();
    s.put(key(), 200);
    if (stage === "metadata") s.failMetadata(403);
    else s.failDelete(503);
    await assert.rejects(retainListingPreviews([s.bucket], { now, apply: true }));
    assert.ok(s.records.has(key()));
  }
});

test("fresh metadata overrides stale list results and missing files are harmless", async () => {
  const s = storage();
  s.put(key(), 1);
  // Simulate a stale listing handle's cached metadata.
  const originalList = s.bucket.getFiles.bind(s.bucket);
  s.bucket.getFiles = (async (options: unknown) => {
    const result = await (originalList as Function)(options);
    for (const file of result[0]) file.metadata = metadata(200);
    return result;
  }) as never;
  assert.equal((await retainListingPreviews([s.bucket], { now, apply: true })).deleted, 0);
  s.failMetadata(404);
  assert.equal((await retainListingPreviews([s.bucket], { now, apply: true })).changedOrMissing, 1);
});

test("active previews survive grace and regenerate identically after safe eviction without changing originals", async () => {
  const s = storage();
  const original = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "pink" } }).jpeg().toBuffer();
  const name = "private/uploads/immutable-original";
  s.records.set(name, { bytes: original, metadata: { ...metadata(200), contentType: "image/jpeg", size: original.length } });
  const sourceBefore = structuredClone(s.records.get(name));
  const source = s.bucket.file(name);
  const first = await getListingPreview(source, 480);
  assert.equal((await retainListingPreviews([s.bucket], { now, apply: true })).deleted, 0);
  const warm = await getListingPreview(source, 480);
  assert.deepEqual(warm, first);
  const derivative = [...s.records.keys()].find(key => key.startsWith("listing-previews/"))!;
  s.records.get(derivative)!.metadata = metadata(91);
  assert.equal((await retainListingPreviews([s.bucket], { now, apply: true })).deleted, 1);
  assert.equal(s.records.has(derivative), false);
  const regenerated = await getListingPreview(source, 480);
  assert.deepEqual(regenerated, first);
  assert.ok(s.records.has(derivative));
  assert.equal((await sharp(regenerated.bytes).metadata()).width, 480);
  assert.deepEqual(structuredClone(s.records.get(name)), sourceBefore);
  assert.deepEqual(s.deleted, [derivative]);
});

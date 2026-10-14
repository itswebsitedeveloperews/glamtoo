import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import type { File } from "@google-cloud/storage";
import { encodeListingPreview, getListingPreview, PreviewSourceError } from "../src/lib/listingPreview";

const input = () => sharp({
  create: { width: 1400, height: 2100, channels: 3, background: "#ac2468" },
}).jpeg().toBuffer();

function storedSource(bytes: Buffer, generation = "1") {
  const stored = new Map<string, Buffer>();
  let downloads = 0;
  let writes = 0;
  const source = {
    name: "private/uploads/immutable-id",
    getMetadata: async () => [{
      generation, contentType: "image/jpeg", size: bytes.length,
    }],
    createReadStream() { downloads++; return Readable.from([bytes]); },
    bucket: { file: (key: string) => ({
      async download() {
        const cached = stored.get(key);
        if (!cached) throw Object.assign(new Error("Not found"), { code: 404 });
        return [cached];
      },
      async save(data: Buffer) {
        assert.ok(key.startsWith("listing-previews/listing-v1/"));
        writes++;
        stored.set(key, data);
      },
    }) },
  } as unknown as File;
  return { source, stored, counts: () => ({ downloads, writes }) };
}

test("listing WebP is sized without cropping/upscaling and original bytes are unchanged", async () => {
  const original = await input();
  const before = Buffer.from(original);
  const result = await encodeListingPreview(original, 480);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 720);
  assert.ok(result.length < original.length);
  assert.deepEqual(original, before);
  const tiny = await sharp({ create: { width: 40, height: 60, channels: 3, background: "pink" } }).png().toBuffer();
  assert.equal((await sharp(await encodeListingPreview(tiny, 960)).metadata()).width, 40);
});

test("reject unsupported sizes, corrupt bytes, and oversized sources", async () => {
  await assert.rejects(encodeListingPreview(await input(), 100000), PreviewSourceError);
  await assert.rejects(encodeListingPreview(Buffer.from("not an image"), 320));
  await assert.rejects(encodeListingPreview(Buffer.alloc(25 * 1024 * 1024 + 1), 320), PreviewSourceError);
});

test("persistent cache and concurrent requests do not reread or rewrite the original", async () => {
  const fixture = storedSource(await input());
  const [one, two] = await Promise.all([
    getListingPreview(fixture.source, 480), getListingPreview(fixture.source, 480),
  ]);
  assert.equal(one.etag, two.etag);
  assert.deepEqual(one.bytes, two.bytes);
  assert.deepEqual(fixture.counts(), { downloads: 1, writes: 1 });
  const warm = await getListingPreview(fixture.source, 480);
  assert.deepEqual(warm.bytes, one.bytes);
  assert.deepEqual(fixture.counts(), { downloads: 1, writes: 1 });
  const larger = await getListingPreview(fixture.source, 640);
  assert.notEqual(larger.etag, one.etag);
  fixture.source.getMetadata = async () => [{ generation: "2", contentType: "image/jpeg", size: 1000 }] as never;
  const changed = await getListingPreview(fixture.source, 480);
  assert.notEqual(changed.etag, one.etag);
});

test("failed generation is not retained as a successful cache entry", async () => {
  const fixture = storedSource(Buffer.from("broken image"));
  await assert.rejects(getListingPreview(fixture.source, 320));
  await assert.rejects(getListingPreview(fixture.source, 320));
  assert.deepEqual(fixture.counts(), { downloads: 2, writes: 0 });
});

test("a listing burst queues instead of dropping hover previews", async () => {
  const bytes = await input();
  const fixtures = Array.from({ length: 8 }, (_, index) => {
    const fixture = storedSource(bytes);
    Object.defineProperty(fixture.source, "name", { value: `private/uploads/image-${index}` });
    return fixture;
  });
  const results = await Promise.all(fixtures.map(fixture => getListingPreview(fixture.source, 320)));
  assert.equal(results.length, 8);
  for (const fixture of fixtures) assert.deepEqual(fixture.counts(), { downloads: 1, writes: 1 });
});

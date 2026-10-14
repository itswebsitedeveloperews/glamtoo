/**
 * Dev-only timing harness. Uses two temporary copies of an existing public
 * catalog upload; never edits the catalog or the original. All temporary
 * originals and their derivatives are deleted in finally.
 *
 * From the workspace root:
 * pnpm --filter @workspace/api-server exec esbuild scripts/measure-listing-preview-warmup.ts --bundle --platform=node --format=esm --external:sharp --external:pino --external:@google-cloud/storage --external:google-auth-library --banner:js='import{createRequire}from"node:module";const require=createRequire(import.meta.url);' --outfile=test/.compiled/measure-preview.mjs
 * node artifacts/api-server/test/.compiled/measure-preview.mjs
 */
import { randomUUID, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { setObjectAclPolicy } from "../src/lib/objectAcl";
import { listingPreviewVersion, listingPreviewWidths } from "../src/lib/listingPreview";
import { publishedListingAlternates, warmPublishedListingAlternate } from "../src/lib/listingPreviewWarmup";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("Run only in a development workspace.");
const storage = new ObjectStorageService();
const temporary: Array<{ path: string; file: Awaited<ReturnType<typeof storage.getObjectEntityFile>> }> = [];
const timings: Record<string, unknown> = { measuredAt: new Date().toISOString(), environment: "development preview; HTTP first request per fresh object and width" };
try {
  const { rows } = await pool.query("SELECT products FROM store_catalog WHERE id=1");
  const path = publishedListingAlternates(rows[0]?.products ?? [])[0];
  if (!path) throw new Error("No published uploaded alternate available to measure.");
  const original = await storage.getObjectEntityFile(path);
  const [bytes] = await original.download();
  timings.sourceBytes = bytes.length;
  // A copied real catalog image avoids synthetic encoding/compression results.
  for (const label of ["onDemand", "prepared"]) {
    const upload = await storage.getObjectEntityUploadURL();
    const put = await fetch(upload, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new Error(`Temporary upload failed (${put.status}).`);
    const tempPath = storage.normalizeObjectEntityPath(upload);
    const file = await storage.getObjectEntityFile(tempPath);
    temporary.push({ path: tempPath, file });
    await setObjectAclPolicy(file, { owner: "preview-performance-fixture", visibility: "public" });
    if (label === "prepared") {
      const start = performance.now();
      await warmPublishedListingAlternate(tempPath);
      timings.preparationMs = Math.round(performance.now() - start);
    }
    const requests = [];
    for (const width of listingPreviewWidths) {
      const start = performance.now();
      const response = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api/storage${tempPath}?preview=${listingPreviewVersion}&width=${width}`, { cache: "no-store" });
      const body = await response.arrayBuffer();
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/webp")) throw new Error(`Preview request failed (${response.status}).`);
      requests.push({ width, elapsedMs: Math.round(performance.now() - start), bytes: body.byteLength, status: response.status });
    }
    timings[label] = requests;
  }
  await mkdir("generated-artifacts", { recursive: true });
  await writeFile("generated-artifacts/listing-preview-first-shopper.json", JSON.stringify(timings, null, 2));
  console.log(JSON.stringify(timings, null, 2));
} finally {
  for (const { file } of temporary) {
    const [metadata] = await file.getMetadata();
    for (const width of listingPreviewWidths) {
      const key = createHash("sha256").update(`${listingPreviewVersion}:${file.name}:${metadata.generation}:${width}`).digest("hex");
      await file.bucket.file(`listing-previews/${listingPreviewVersion}/${key}.webp`).delete({ ignoreNotFound: true });
    }
    await file.delete({ ignoreNotFound: true });
  }
  await pool.end();
}

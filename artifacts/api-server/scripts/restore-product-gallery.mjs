import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { applyGalleryRepair, recovery } from "./gallery-repair.mjs";
import { referenceRecovery } from "./reference-gallery-recovery.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--reference-shop")) {
  throw new Error("Usage: restore-product-gallery.mjs [--reference-shop]");
}
const repair = args[0] === "--reference-shop" ? referenceRecovery : recovery;
const expectedHashes = new Map((repair.products ?? [repair]).flatMap((product) =>
  product.galleryImages.map((path, index) => [path, product.gallerySha256?.[index]])));

const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  // Use the existing storage service/authentication without exposing credentials.
  const { build } = await import("esbuild");
  const { mkdir } = await import("node:fs/promises");
  const output = new URL("../../../generated-artifacts/gallery-storage.cjs", import.meta.url);
  await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/objectStorage.ts", import.meta.url))],
    outfile: fileURLToPath(output), bundle: true, platform: "node", format: "cjs",
  });
  const { ObjectStorageService } = await import(output.href);
  const storage = new ObjectStorageService();
  console.log(await applyGalleryRepair(client, async (paths) => {
    for (const path of paths) {
      const file = await storage.getObjectEntityFile(path);
      const [metadata] = await file.getMetadata();
      if (!metadata.contentType?.startsWith("image/") || Number(metadata.size) <= 0
        || !await storage.canAccessObjectEntity({ objectFile: file, requestedPermission: "read" })) {
        throw new Error(`Gallery recovery stopped: original photo is not publicly readable: ${path}`);
      }
      // Read the actual bytes as well; metadata alone cannot prove accessibility.
      const [bytes] = await file.download();
      const expectedHash = expectedHashes.get(path);
      if (expectedHash && createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
        throw new Error(`Gallery recovery stopped: original photo bytes changed: ${path}`);
      }
    }
  }, repair));
} finally {
  client.release();
  await pool.end();
}

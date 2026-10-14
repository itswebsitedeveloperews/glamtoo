import { createHash } from "node:crypto";

const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;

export const productFingerprint = (product) =>
  createHash("sha256").update(JSON.stringify(stable(product))).digest("hex");

// Original screenshot-backed repair. Additional product galleries are handled
// only by the separately pinned, merchant-supplied reference-shop recovery.
// Orphaned uploads alone are never evidence that a gallery should be repopulated.
export const recovery = {
  key: "mesh-floral-original-gallery-2026-10-14",
  productId: 109,
  expectedFingerprint: "86e5758a9282fa661fc08aa9a44fcd5fde4afa001426dbc48a14f253d74721e9",
  galleryImages: [
    "/objects/uploads/e21d69ba-69d0-4f17-9521-fc6936bc2f4e",
    "/objects/uploads/96ba7ef5-6e5c-4e08-aa34-d5dc0835d9ce",
    "/objects/uploads/742554e7-72d4-4f08-acab-0f205c9a14e3",
  ],
};

export function repairedProducts(products, repair = recovery) {
  const original = products.find((product) => product.id === repair.productId);
  // A merchant edit, deletion, or explicit gallery removal since the audited
  // snapshot requires a new decision, not a guessed merge with seed defaults.
  if (!original || productFingerprint(original) !== repair.expectedFingerprint) {
    throw new Error("Gallery recovery stopped: the audited product changed. Recheck the catalog before applying any repair.");
  }
  if (!Array.isArray(original.galleryImages) || original.galleryImages.length) {
    throw new Error("Gallery recovery requires the audited empty gallery.");
  }
  return products.map((product) => product === original
    ? { ...product, galleryImages: [...repair.galleryImages] }
    : product);
}

export async function applyGalleryRepair(client, verifyMedia, repair = recovery) {
  await client.query("BEGIN");
  try {
    // Same lock as catalog saves; do not replace concurrent merchant changes.
    await client.query("SELECT pg_advisory_xact_lock(782616310, 1)");
    const receipt = await client.query("SELECT id FROM catalog_gallery_repairs WHERE id = $1", [repair.key]);
    if (receipt.rows.length) {
      await client.query("COMMIT");
      return { status: "already-applied" };
    }
    const { rows } = await client.query("SELECT * FROM store_catalog WHERE id = 1 FOR UPDATE");
    if (!rows.length) throw new Error("Gallery recovery stopped: no initialized catalog.");
    const before = rows[0];
    const repairs = repair.products ?? [repair];
    const products = repairs.reduce((products, item) => repairedProducts(products, item), before.products);
    const restoredImages = repairs.flatMap((item) => item.galleryImages);
    // Verify public bytes before either backup or update is committed.
    await verifyMedia([...new Set(restoredImages)]);
    await client.query(
      "INSERT INTO catalog_gallery_repairs (id, catalog_before, restored_images) VALUES ($1, $2, $3)",
      [repair.key, JSON.stringify(before), JSON.stringify(restoredImages)],
    );
    await client.query("UPDATE store_catalog SET products = $1, updated_at = NOW() WHERE id = 1", [JSON.stringify(products)]);
    await client.query("COMMIT");
    return {
      status: "restored",
      ...(repair.products ? { productIds: repairs.map((item) => item.productId) } : { productId: repair.productId }),
      supportingPhotos: restoredImages.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

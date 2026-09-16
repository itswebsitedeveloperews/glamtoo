import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, storeCatalogTable } from "@workspace/db";
import { requireAdmin } from "../adminAuth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const catalogId = 1;
const objectStorageService = new ObjectStorageService();
let catalogTableReady: Promise<void> | undefined;

type JsonRecord = Record<string, unknown>;

function ensureCatalogTable() {
  catalogTableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS store_catalog (
      id integer PRIMARY KEY,
      products jsonb NOT NULL,
      categories jsonb NOT NULL,
      updated_at timestamp with time zone NOT NULL DEFAULT NOW()
    )
  `).then(() => undefined);
  return catalogTableReady;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown, fallback = "", maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function asPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeInteger(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeVariation(value: unknown, index: number): JsonRecord {
  const variation = isRecord(value) ? value : {};
  return {
    id: asPositiveInteger(variation.id, index + 1),
    size: asText(variation.size),
    colour: asText(variation.colour),
    sku: asText(variation.sku, "", 100),
    price: asText(variation.price, "", 50),
    stock: asNonNegativeInteger(variation.stock),
  };
}

function normalizeProduct(value: unknown, index: number): JsonRecord {
  const product = isRecord(value) ? value : {};
  const type = product.type === "Variable" ? "Variable" : "Simple";
  const galleryImages = Array.isArray(product.galleryImages)
    ? product.galleryImages.filter((image): image is string => typeof image === "string" && image.trim().length > 0).map((image) => image.trim().slice(0, 2000))
    : [];
  const variations = Array.isArray(product.variations)
    ? product.variations.map(normalizeVariation)
    : [];
  return {
    id: asPositiveInteger(product.id, index + 1),
    slug: asText(product.slug, "", 200),
    name: asText(product.name, "Glam Too piece", 200),
    category: asText(product.category, "", 100),
    price: asText(product.price, "", 50),
    ...(typeof product.salePrice === "string" && product.salePrice.trim() ? { salePrice: product.salePrice.trim().slice(0, 50) } : {}),
    stock: asNonNegativeInteger(product.stock),
    status: product.status === "Published" ? "Published" : "Draft",
    type,
    description: asText(product.description, "", 5000),
    ...(typeof product.longDescription === "string" && product.longDescription.trim() ? { longDescription: product.longDescription.trim().slice(0, 20000) } : {}),
    ...(typeof product.fitAndSize === "string" && product.fitAndSize.trim() ? { fitAndSize: product.fitAndSize.trim().slice(0, 20000) } : {}),
    ...(typeof product.deliveryAndReturns === "string" && product.deliveryAndReturns.trim() ? { deliveryAndReturns: product.deliveryAndReturns.trim().slice(0, 20000) } : {}),
    ...(typeof product.careDetails === "string" && product.careDetails.trim() ? { careDetails: product.careDetails.trim().slice(0, 20000) } : {}),
    sku: asText(product.sku, "", 100),
    image: asText(product.image, "", 2000),
    position: asText(product.position, "50% 50%", 100),
    galleryImages,
    variations: type === "Variable" ? variations : [],
  };
}

function normalizeCategory(value: unknown, index: number): JsonRecord {
  const category = isRecord(value) ? value : {};
  const parentId = category.parentId === null
    ? null
    : typeof category.parentId === "number" && Number.isInteger(category.parentId) && category.parentId > 0
      ? category.parentId
      : null;
  return {
    id: asPositiveInteger(category.id, index + 1),
    name: asText(category.name, "", 100),
    image: asText(category.image, "", 2000),
    description: asText(category.description, "", 1000),
    parentId,
  };
}

function parseCatalogBody(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.products) || !Array.isArray(body.categories)) return null;
  const products = body.products.map(normalizeProduct);
  const categories = body.categories.map(normalizeCategory).filter((category) => Boolean(category.name));
  const productIds = new Set<number>();
  if (products.some((product) => {
    const id = product.id as number;
    if (productIds.has(id)) return true;
    productIds.add(id);
    return false;
  })) return null;
  return { products, categories };
}

async function getCatalogRecord() {
  await ensureCatalogTable();
  const [record] = await db.select().from(storeCatalogTable).where(eq(storeCatalogTable.id, catalogId)).limit(1);
  return record
    ? { products: record.products as JsonRecord[], categories: record.categories as JsonRecord[], initialized: true, updatedAt: record.updatedAt }
    : { products: [], categories: [], initialized: false, updatedAt: null };
}

async function setCatalogMediaVisibility(products: JsonRecord[], categories: JsonRecord[], owner: string) {
  const visibilityByPath = new Map<string, "public" | "private">();
  function record(value: unknown, visibility: "public" | "private") {
    if (typeof value !== "string" || !value.startsWith("/objects/uploads/")) return;
    if (visibility === "public" || !visibilityByPath.has(value)) visibilityByPath.set(value, visibility);
  }
  products.forEach((product) => {
    const visibility = product.status === "Published" ? "public" : "private";
    record(product.image, visibility);
    if (Array.isArray(product.galleryImages)) product.galleryImages.forEach((image) => record(image, visibility));
  });
  categories.forEach((category) => record(category.image, "public"));
  await Promise.all([...visibilityByPath.entries()].map(([path, visibility]) =>
    objectStorageService.trySetObjectEntityAclPolicy(path, { owner, visibility }),
  ));
}

async function saveCatalog(products: JsonRecord[], categories: JsonRecord[], owner: string) {
  await setCatalogMediaVisibility(products, categories, owner);
  await ensureCatalogTable();
  await db.insert(storeCatalogTable)
    .values({ id: catalogId, products, categories })
    .onConflictDoUpdate({
      target: storeCatalogTable.id,
      set: { products, categories, updatedAt: new Date() },
    });
  return getCatalogRecord();
}

router.get("/catalog", async (request, response) => {
  try {
    const catalog = await getCatalogRecord();
    response.set("Cache-Control", "no-store").json({
      products: catalog.products.filter((product) => product.status === "Published"),
      categories: catalog.categories,
      initialized: catalog.initialized,
      updatedAt: catalog.updatedAt,
    });
  } catch (error) {
    request.log.error({ error }, "Catalog could not be loaded");
    response.status(503).json({ error: "The catalog could not be loaded right now." });
  }
});

router.get("/admin/catalog", requireAdmin, async (request, response) => {
  try {
    response.set("Cache-Control", "no-store").json(await getCatalogRecord());
  } catch (error) {
    request.log.error({ error }, "Admin catalog could not be loaded");
    response.status(503).json({ error: "The catalog could not be loaded right now." });
  }
});

router.put("/admin/catalog", requireAdmin, async (request, response) => {
  const parsed = parseCatalogBody(request.body);
  if (!parsed) {
    response.status(400).json({ error: "Products and categories must be valid arrays." });
    return;
  }
  try {
    const userId = getAuth(request).userId;
    if (!userId) {
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    response.json(await saveCatalog(parsed.products, parsed.categories, userId));
  } catch (error) {
    request.log.error({ error }, "Admin catalog could not be saved");
    response.status(503).json({ error: "The catalog could not be saved right now." });
  }
});

router.post("/admin/catalog/migrate", requireAdmin, async (request, response) => {
  const parsed = parseCatalogBody(request.body);
  if (!parsed) {
    response.status(400).json({ error: "Products and categories must be valid arrays." });
    return;
  }
  try {
    const userId = getAuth(request).userId;
    if (!userId) {
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const existing = await getCatalogRecord();
    const productsById = new Map(existing.products.map((product) => [product.id as number, product]));
    parsed.products.forEach((product) => productsById.set(product.id as number, { ...productsById.get(product.id as number), ...product }));
    const categoriesById = new Map(existing.categories.map((category) => [category.id as number, category]));
    parsed.categories.forEach((category) => categoriesById.set(category.id as number, { ...categoriesById.get(category.id as number), ...category }));
    response.json(await saveCatalog([...productsById.values()], [...categoriesById.values()], userId));
  } catch (error) {
    request.log.error({ error }, "Catalog migration could not be completed");
    response.status(503).json({ error: "The existing catalog could not be migrated right now." });
  }
});

export default router;
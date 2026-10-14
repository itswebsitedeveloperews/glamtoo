import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { pool, type PoolClient } from "@workspace/db";
import { SaveAdminCatalogBody } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { backfillCatalog, CatalogValidationError, prepareCatalog, type Catalog } from "../catalogSlugs";
import { InventoryError, syncCatalogProduct, type CatalogProductInput } from "../inventoryService";

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
      home_page jsonb,
      slug_reservations jsonb NOT NULL DEFAULT '{"products":[],"categories":[]}'::jsonb,
      updated_at timestamp with time zone NOT NULL DEFAULT NOW()
    )
  `).then(() => pool.query("ALTER TABLE store_catalog ADD COLUMN IF NOT EXISTS home_page jsonb"))
    .then(() => pool.query(`ALTER TABLE store_catalog ADD COLUMN IF NOT EXISTS slug_reservations jsonb NOT NULL DEFAULT '{"products":[],"categories":[]}'::jsonb`))
    .then(() => undefined).catch((error) => {
    catalogTableReady = undefined;
    throw error;
  });
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
  const attributes = isRecord(variation.attributes)
    ? Object.fromEntries(Object.entries(variation.attributes)
      .filter(([key, item]) => /^[a-zA-Z0-9 _-]{1,60}$/.test(key) && typeof item === "string")
      .map(([key, item]) => [key.trim(), String(item).trim().slice(0, 200)]))
    : {};
  return {
    id: asPositiveInteger(variation.id, index + 1),
    size: asText(variation.size),
    colour: asText(variation.colour),
    attributes,
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
  const variationAttributes = Array.isArray(product.variationAttributes)
    ? [...new Set(product.variationAttributes.filter((attribute): attribute is string =>
      typeof attribute === "string" && /^[a-zA-Z0-9 _-]{1,60}$/.test(attribute.trim()),
    ).map((attribute) => attribute.trim()))]
    : [];
  return {
    id: asPositiveInteger(product.id, index + 1),
    slug: asText(product.slug, "", 200),
    name: asText(product.name, "Glam Too piece", 200),
    category: asText(product.category, "", 100),
    eyebrow: asText(product.eyebrow, "", 200),
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
    variationAttributes: type === "Variable" ? variationAttributes : [],
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
    ...(typeof category.slug === "string" ? { slug: category.slug } : {}),
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
  const categoryIds = new Set<number>();
  if (categories.some((category) => {
    const id = category.id as number;
    if (categoryIds.has(id)) return true;
    categoryIds.add(id);
    return false;
  })) return null;
  return { products, categories };
}

type HomePageSettings = { categoryIds: number[]; obsessionIds: number[]; momentIds: number[] };
function parseHomePageSettings(body: unknown): HomePageSettings | null {
  if (!isRecord(body)) return null;
  const fields = ["categoryIds", "obsessionIds", "momentIds"] as const;
  for (const field of fields) {
    const ids = body[field];
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || new Set(ids).size !== ids.length)) return null;
  }
  if ((body.categoryIds as number[]).length > 5 || (body.obsessionIds as number[]).length > 3 || (body.momentIds as number[]).length > 4) return null;
  return { categoryIds: body.categoryIds as number[], obsessionIds: body.obsessionIds as number[], momentIds: body.momentIds as number[] };
}

type CatalogRecord = Catalog & { homePage: HomePageSettings | null; initialized: boolean; updatedAt: Date | null; reservations: Catalog };
async function withCatalogLock<T>(action: (record: CatalogRecord, query: (sql: string, values?: unknown[]) => Promise<void>, client: PoolClient) => Promise<T>): Promise<T> {
  await ensureCatalogTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The advisory lock also serializes first-time creation when there is no row to lock yet.
    await client.query("SELECT pg_advisory_xact_lock(782616310, 1)");
    const { rows } = await client.query("SELECT products, categories, home_page, slug_reservations, updated_at FROM store_catalog WHERE id = $1 FOR UPDATE", [catalogId]);
    const row = rows[0];
    const old: CatalogRecord = row
      ? { products: row.products, categories: row.categories, homePage: row.home_page, reservations: row.slug_reservations, initialized: true, updatedAt: row.updated_at }
      : { products: [], categories: [], homePage: null, reservations: { products: [], categories: [] }, initialized: false, updatedAt: null };
    const filled = backfillCatalog(old);
    if (row && JSON.stringify(filled) !== JSON.stringify({ products: old.products, categories: old.categories })) {
      await client.query("UPDATE store_catalog SET products = $1, categories = $2, updated_at = NOW() WHERE id = $3", [JSON.stringify(filled.products), JSON.stringify(filled.categories), catalogId]);
      old.updatedAt = new Date();
    }
    const result = await action({ ...old, ...filled }, async (sql, values) => { await client.query(sql, values); }, client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function getCatalogRecord() {
  return withCatalogLock(async (record) => record);
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

async function saveCatalog(parsed: Catalog, raw: Catalog, owner: string, migrate = false, stockUpdates: string[] = []) {
  if (!Array.isArray(stockUpdates) || stockUpdates.length > 500 || stockUpdates.some((key) => typeof key !== "string" || !/^\d+(?::\d+)?$/.test(key))) {
    throw new CatalogValidationError("Stock updates must identify the edited product or variation.");
  }
  const saved = await withCatalogLock(async (record, query, client) => {
    let next = parsed;
    let rawNext = raw;
    if (migrate) {
      const products = new Map(record.products.map((item) => [item.id, item]));
      parsed.products.forEach((item) => products.set(item.id, item));
      const categories = new Map(record.categories.map((item) => [item.id, item]));
      parsed.categories.forEach((item) => categories.set(item.id, item));
      const rawProducts = new Map(record.products.map((item) => [item.id, item]));
      raw.products.forEach((item) => rawProducts.set(item.id, item));
      const rawCategories = new Map(record.categories.map((item) => [item.id, item]));
      raw.categories.forEach((item) => rawCategories.set(item.id, item));
      next = { products: [...products.values()], categories: [...categories.values()] };
      rawNext = { products: [...rawProducts.values()], categories: [...rawCategories.values()] };
    }
    for (const kind of ["products", "categories"] as const) {
      const retiredIds = new Set(record.reservations[kind].map((item) => item.id));
      if (next[kind].some((item) => retiredIds.has(item.id))) {
        throw new CatalogValidationError("A deleted catalog ID cannot be reused.");
      }
    }
    const prepared = prepareCatalog(next, {
      products: [...record.products, ...record.reservations.products],
      categories: [...record.categories, ...record.reservations.categories],
    }, rawNext);
    const reservations: Catalog = { products: [...record.reservations.products], categories: [...record.reservations.categories] };
    for (const kind of ["products", "categories"] as const) {
      const active = new Set(prepared[kind].map((item) => item.id));
      reservations[kind].push(...record[kind].filter((item) => !active.has(item.id)));
    }
    // Match the previous save semantics: an ACL failure must not report a
    // failed request after a durable catalog commit.
    await setCatalogMediaVisibility(prepared.products, prepared.categories, owner);
    const activeIds = new Set(prepared.products.map((item) => item.id));
    const removedIds = record.products.filter((item) => !activeIds.has(item.id)).map((item) => String(item.id));
    if (removedIds.length) {
      // Retain rows and reservation FKs for historical payments/refunds. Stock
      // is unchanged; row locks serialize retirement with new reservations.
      await query(`UPDATE product_inventory SET active = false, updated_at = NOW()
        WHERE catalog_product_id = ANY($1::text[])
          OR (catalog_product_id = '' AND product_id = ANY($1::text[]))`, [removedIds]);
    }
    for (const product of prepared.products) {
      const previous = record.products.find((item) => item.id === product.id);
      if (JSON.stringify(previous) === JSON.stringify(product)) continue;
      // Unpriced draft content need not be sellable yet.
      if (product.status !== "Published") {
        await query("UPDATE product_inventory SET active = false, updated_at = NOW() WHERE catalog_product_id = $1", [String(product.id)]);
        continue;
      }
      await syncCatalogProduct({
        ...product, id: String(product.id),
        variations: (product.variations as Array<Record<string, unknown>> ?? []).map((item) => ({ ...item, id: String(item.id) })),
      } as CatalogProductInput, client, previous && previous.type === product.type
        ? product.type === "Variable"
          ? (product.variations as Array<Record<string, unknown>>).filter((item) =>
            !stockUpdates.includes(`${product.id}:${item.id}`)
              && (previous.variations as Array<Record<string, unknown>> ?? []).some((old) => old.id === item.id),
          ).map((item) => `${product.id}:${item.id}`)
          : !stockUpdates.includes(String(product.id)) ? [String(product.id)] : []
        : []);
    }
    await query(`INSERT INTO store_catalog (id, products, categories, slug_reservations) VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET products = EXCLUDED.products, categories = EXCLUDED.categories, slug_reservations = EXCLUDED.slug_reservations, updated_at = NOW()`,
    [catalogId, JSON.stringify(prepared.products), JSON.stringify(prepared.categories), JSON.stringify(reservations)]);
    return { ...record, ...prepared, initialized: true, updatedAt: new Date() };
  });
  return saved;
}

router.get("/catalog", async (request, response) => {
  try {
    const catalog = await getCatalogRecord();
    response.set("Cache-Control", "no-store").json({
      products: catalog.products.filter((product) => product.status === "Published"),
      categories: catalog.categories,
      homePage: catalog.homePage,
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

router.put("/admin/catalog/home-page", requireAdmin, async (request, response) => {
  const settings = parseHomePageSettings(request.body);
  if (!settings) {
    response.status(400).json({ error: "Select valid categories and products (up to five categories, three obsessions, and four outfits)." });
    return;
  }
  try {
    await withCatalogLock(async (catalog, query) => {
      if (!catalog.initialized) throw new CatalogValidationError("Set up the catalog before editing the home page.");
      const categoryIds = new Set(catalog.categories.map((item) => item.id));
      const productIds = new Set(catalog.products.filter((item) => item.status === "Published").map((item) => item.id));
      if (settings.categoryIds.some((id) => !categoryIds.has(id))
        || [...settings.obsessionIds, ...settings.momentIds].some((id) => !productIds.has(id))) {
        throw new CatalogValidationError("A selected category or product no longer exists or is unpublished. Refresh and choose again.");
      }
      await query("UPDATE store_catalog SET home_page = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(settings), catalogId]);
    });
    response.set("Cache-Control", "no-store").json({ homePage: settings });
  } catch (error) {
    if (error instanceof CatalogValidationError || error instanceof InventoryError) { response.status(400).json({ error: error.message }); return; }
    request.log.error({ error }, "Home page settings could not be saved");
    response.status(503).json({ error: "Home page settings could not be saved right now." });
  }
});

router.put("/admin/catalog", requireAdmin, async (request, response) => {
  const input = SaveAdminCatalogBody.safeParse(request.body);
  const parsed = input.success ? parseCatalogBody(input.data) : null;
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
    response.json(await saveCatalog(parsed, request.body as Catalog, userId, false, request.body.stockUpdates ?? []));
  } catch (error) {
    if (error instanceof CatalogValidationError || error instanceof InventoryError) { response.status(400).json({ error: error.message }); return; }
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
    response.json(await saveCatalog(parsed, request.body as Catalog, userId, true));
  } catch (error) {
    if (error instanceof CatalogValidationError || error instanceof InventoryError) { response.status(400).json({ error: error.message }); return; }
    request.log.error({ error }, "Catalog migration could not be completed");
    response.status(503).json({ error: "The existing catalog could not be migrated right now." });
  }
});

export { getCatalogRecord, saveCatalog };
export default router;
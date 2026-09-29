export type Item = Record<string, unknown>;
export type Catalog = { products: Item[]; categories: Item[] };

export const slugify = (value: string) => value.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const validSlug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
const history = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string")
    .map((entry) => slugify(entry)).filter(validSlug))]
  : [];

export class CatalogValidationError extends Error {}

/** Raw client payload is required: omitted keys must not erase persisted metadata. */
export function prepareCatalog(incoming: Catalog, persisted: Catalog, raw: Catalog): Catalog {
  const prepare = (kind: "products" | "categories") => {
    const previous = new Map(persisted[kind].map((item) => [item.id, item]));
    return incoming[kind].map((item, index) => {
      const original = previous.get(item.id);
      const supplied = raw[kind][index];
      const rawItem = supplied && typeof supplied === "object" && !Array.isArray(supplied) ? supplied : {} as Item;
      const fallback = slugify(String(item.name || `${kind === "products" ? "product" : "category"}-${item.id}`));
      const priorSlug = original?.slug;
      const requestedSlug = Object.hasOwn(rawItem, "slug") ? rawItem.slug : priorSlug;
      const slug = requestedSlug === undefined || requestedSlug === "" ? fallback : requestedSlug;
      if (!validSlug(slug) || (kind === "products" && /^\d+$/.test(slug))) {
        throw new CatalogValidationError(`Invalid ${kind === "products" ? "product" : "category"} slug.`);
      }
      const oldHistory = history(original?.slugHistory);
      const slugHistory = [...new Set([...oldHistory, ...(validSlug(priorSlug) && priorSlug !== slug ? [priorSlug] : [])])].filter((entry) => entry !== slug);
      const result: Item = { ...item, slug, slugHistory };
      if (original) {
        // Older clients may not know newer content fields. A missing key is not a request to clear it.
        for (const [key, value] of Object.entries(original)) {
          if (key !== "id" && key !== "slug" && key !== "slugHistory" && !Object.hasOwn(rawItem, key)) result[key] = value;
        }
      }
      return result;
    });
  };
  const products = prepare("products");
  const categories = prepare("categories");
  for (const [kind, items] of [["product", products], ["category", categories]] as const) {
    const ids = new Set<unknown>();
    const aliases = new Set<string>();
    for (const item of items) {
      if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || ids.has(item.id)) throw new CatalogValidationError(`Duplicate or invalid ${kind} ID.`);
      ids.add(item.id);
      for (const alias of [item.slug as string, ...history(item.slugHistory)]) {
        if (aliases.has(alias)) throw new CatalogValidationError(`Duplicate or reserved ${kind} slug: ${alias}.`);
        aliases.add(alias);
      }
    }
    // Removed entities' historical URLs remain reserved, preventing links from resolving to a new owner.
    for (const removed of persisted[kind === "product" ? "products" : "categories"]) {
      if (ids.has(removed.id)) continue;
      for (const alias of [removed.slug, ...history(removed.slugHistory)]) {
        if (typeof alias === "string" && aliases.has(alias)) throw new CatalogValidationError(`Reserved ${kind} slug: ${alias}.`);
      }
    }
  }
  // Numeric product IDs are aliases even when the current slug differs.
  const ids = new Set(products.map((item) => String(item.id)));
  if (products.some((item) => [item.slug, ...history(item.slugHistory)].some((alias) => ids.has(alias as string)))) {
    throw new CatalogValidationError("A product slug conflicts with a legacy numeric ID.");
  }
  return { products, categories };
}

/** Existing rows predate slugHistory. Preserve their public slugs and generate category URLs once. */
export function backfillCatalog(catalog: Catalog): Catalog {
  const fill = (items: Item[], label: string) => {
    // Keep each previously reachable current slug with its first owner. Duplicate
    // current slugs could never reach later owners; deterministically repair those.
    const owners = new Map<string, unknown>();
    const current = items.map((item) => typeof item.slug === "string" ? slugify(item.slug) : "");
    const numericIds = label === "product" ? new Set(items.map((item) => String(item.id))) : new Set<string>();
    current.forEach((slug, index) => {
      if (validSlug(slug) && !(label === "product" && /^\d+$/.test(slug)) && !owners.has(slug)) owners.set(slug, items[index].id);
    });
    const historicalOwners = new Map(owners);
    items.forEach((item) => history(item.slugHistory).forEach((alias) => {
      if (!numericIds.has(alias) && !historicalOwners.has(alias)) historicalOwners.set(alias, item.id);
    }));
    if (label === "product") items.forEach((item, index) => {
      const alias = current[index];
      if (/^\d+$/.test(alias) && !numericIds.has(alias) && !historicalOwners.has(alias)) historicalOwners.set(alias, item.id);
    });
    const reserved = new Set([...historicalOwners.keys(), ...numericIds]);
    const seen = new Set<string>();
    return items.map((item, index) => {
      const preferred = current[index];
      const slugHistory = [...history(item.slugHistory), ...(label === "product" && /^\d+$/.test(preferred) ? [preferred] : [])]
        .filter((alias) => !numericIds.has(alias) && historicalOwners.get(alias) === item.id);
      if (validSlug(preferred) && !numericIds.has(preferred) && owners.get(preferred) === item.id && !seen.has(preferred)) {
        seen.add(preferred);
        return { ...item, slug: preferred, slugHistory: slugHistory.filter((alias) => alias !== preferred) };
      }
      const base = slugify(String(item.name || `${label}-${item.id}`)).slice(0, 180).replace(/-+$/, "") || `${label}-${item.id}`;
      let slug = base;
      let suffix = 2;
      while (reserved.has(slug) || /^\d+$/.test(slug)) slug = `${base}-${suffix++}`;
      reserved.add(slug);
      return { ...item, slug, slugHistory: slugHistory.filter((alias) => alias !== slug) };
    });
  };
  return {
    products: fill(catalog.products, "product"),
    categories: fill(catalog.categories, "category"),
  };
}
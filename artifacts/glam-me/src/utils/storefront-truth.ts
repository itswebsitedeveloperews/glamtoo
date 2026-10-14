import type { CatalogCategory, CatalogProduct } from "../data/catalog";

export type CatalogStatus = "loading" | "ready" | "uninitialized" | "error";

/** Count explicit category membership, including descendants, never inferred arrivals. */
export function categoryProductCount(category: CatalogCategory, categories: CatalogCategory[], products: CatalogProduct[]) {
  const ids = new Set([category.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of categories) {
      if (child.parentId != null && ids.has(child.parentId) && !ids.has(child.id)) {
        ids.add(child.id);
        changed = true;
      }
    }
  }
  const names = new Set(categories.filter((item) => ids.has(item.id)).map((item) => item.name.trim().toLowerCase()));
  return products.filter((product) => product.status === "Published" && names.has(product.category.trim().toLowerCase())).length;
}

const hasContent = (value?: string) => Boolean(value?.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim());
export function productContentGaps(product: Pick<CatalogProduct, "status" | "description" | "longDescription" | "fitAndSize" | "careDetails">) {
  if (product.status !== "Published") return [];
  return [
    ...(!hasContent(product.longDescription) ? ["Detailed description"] : []),
    ...(!hasContent(product.fitAndSize) ? ["Fit / sizing"] : []),
    ...(!hasContent(product.careDetails) ? ["Care details"] : []),
  ];
}

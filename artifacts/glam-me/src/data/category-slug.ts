export function slugifyCatalogName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type CategoryWithSlug = { name: string; slug?: string };

export function getCategorySlug(category: CategoryWithSlug): string {
  return category.slug?.trim() || slugifyCatalogName(category.name);
}

/** Products store a category name, rather than its URL slug. */
export function getProductCategorySlug(categoryName: string, categories: CategoryWithSlug[]): string {
  const normalizedName = slugifyCatalogName(categoryName);
  const category = categories.find((item) => slugifyCatalogName(item.name) === normalizedName);
  return category ? getCategorySlug(category) : normalizedName;
}
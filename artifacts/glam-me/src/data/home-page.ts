import type { CatalogCategory, CatalogProduct } from "./catalog";

export type HomePageSettings = {
  categoryIds: number[];
  obsessionIds: number[];
  momentIds: number[];
};

export function defaultHomePageSettings(categories: CatalogCategory[], products: CatalogProduct[]): HomePageSettings {
  const published = products.filter((product) => product.status === "Published");
  return {
    categoryIds: categories.filter((category) => category.parentId == null).map((category) => category.id),
    obsessionIds: published.slice(0, 3).map((product) => product.id),
    momentIds: published.slice(3, 7).map((product) => product.id),
  };
}
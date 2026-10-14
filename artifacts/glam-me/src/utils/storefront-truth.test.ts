import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryProductCount, productContentGaps } from "./storefront-truth.ts";
import type { CatalogCategory, CatalogProduct } from "../data/catalog";

const categories = [
  { id: 1, name: "Clothes", parentId: null },
  { id: 2, name: "Dresses", parentId: 1 },
  { id: 3, name: "Evening dresses", parentId: 2 },
  { id: 4, name: "New In", parentId: null },
] as CatalogCategory[];
const products = [{ category: "Evening dresses", status: "Published" }, { category: "Dresses", status: "Draft" }] as CatalogProduct[];

test("populated parents include nested children, but draft products and unassigned New In do not count", () => {
  assert.equal(categoryProductCount(categories[0], categories, products), 1);
  assert.equal(categoryProductCount(categories[1], categories, products), 1);
  assert.equal(categoryProductCount(categories[3], categories, products), 0);
  assert.equal(categoryProductCount(categories[0], categories, []), 0);
});

test("cyclic legacy category relationships terminate and do not double-count", () => {
  assert.equal(categoryProductCount(categories[0], [{ ...categories[0], parentId: 2 }, ...categories.slice(1)], products), 1);
});

test("published information gaps are nonblocking and never generate product facts", () => {
  const product = { status: "Published" as const, description: "Existing short copy", longDescription: "<p>&nbsp;</p>", fitAndSize: "", careDetails: "" };
  const before = structuredClone(product);
  assert.deepEqual(productContentGaps(product), ["Detailed description", "Fit / sizing", "Care details"]);
  assert.deepEqual(product, before);
  assert.deepEqual(productContentGaps({ ...product, status: "Draft" }), []);
  assert.deepEqual(productContentGaps({ ...product, longDescription: "Owner supplied", fitAndSize: "Owner supplied", careDetails: "Owner supplied" }), []);
});

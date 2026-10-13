import assert from "node:assert/strict";
import { test } from "node:test";
import { getProductPricing } from "./product-pricing.ts";

const variable = (prices: Array<[string, number]>, parent = "£29.99") => ({
  type: "Variable" as const,
  price: parent,
  variations: prices.map(([price, stock], id) => ({ id, price, stock, size: String(id), colour: "", sku: "" })),
});

test("GT-003: a lower parent price cannot advertise an unpurchasable £29.99", () => {
  const product = variable([["£34.99", 2], ["£34.99", 2]]);
  assert.deepEqual(getProductPricing(product), {
    amounts: [34.99, 34.99], min: 34.99, max: 34.99, label: "£34.99",
  });
});

test("different available prices show a range, ignoring cheaper sold-out variants", () => {
  const product = variable([["£19.99", 0], ["£34.99", 2], ["£39.99", 1]]);
  assert.equal(getProductPricing(product).label, "£34.99 – £39.99");
  assert.equal(getProductPricing(product).min, 34.99);
  product.variations[1].stock = 0;
  assert.equal(getProductPricing(product).label, "£39.99");
});

test("all sold out or missing variants do not fall back to parent price", () => {
  assert.equal(getProductPricing(variable([["£34.99", 0]])).label, "Out of stock");
  assert.equal(getProductPricing(variable([])).min, null);
  assert.equal(getProductPricing(variable([])).label, "Out of stock");
});

test("simple products preserve their own price", () => {
  const product = { ...variable([["£34.99", 2]]), type: "Simple" as const, price: "£19.99" };
  assert.equal(getProductPricing(product).label, "£19.99");
});

test("invalid variant prices never become a zero-price or parent-price offer", () => {
  assert.equal(getProductPricing(variable([["", 1], ["NaN", 2]])).label, "Price unavailable");
  assert.equal(getProductPricing(variable([["£0.00", 1]])).label, "£0.00");
});

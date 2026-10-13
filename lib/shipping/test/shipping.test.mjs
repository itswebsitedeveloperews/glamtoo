import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateShippingAmount, selectShippingMethod } from "../src/index.ts";

for (const [threshold, price] of [[7500, 395], [10000, 399]]) {
  for (const subtotal of [1999, 7499, 7500, 7997, 9999, 10000]) {
    test(`rate ${price}, threshold ${threshold}, subtotal ${subtotal}`, () => {
      const fee = calculateShippingAmount({ price, freeOver: threshold }, subtotal);
      assert.equal(fee, subtotal >= threshold ? 0 : price);
      assert.equal(subtotal + fee, subtotal + (subtotal >= threshold ? 0 : price));
    });
  }
}
test("no threshold, zero-price and zero-threshold methods", () => {
  assert.equal(calculateShippingAmount({ price: 599, freeOver: null }, 10000), 599);
  assert.equal(calculateShippingAmount({ price: 0, freeOver: null }, 1999), 0);
  assert.equal(calculateShippingAmount({ price: 399, freeOver: 0 }, 1999), 0);
});
test("reject invalid amounts instead of returning a misleading quote", () => {
  for (const subtotal of [-1, NaN, 7499.5]) {
    assert.throws(() => calculateShippingAmount({ price: 399, freeOver: 10000 }, subtotal));
  }
});
test("cart and checkout choose the same enabled service, including saved and removed methods", () => {
  const methods = [
    { id: "1", name: "Standard", description: "", price: 399, freeOver: 10000, enabled: true },
    { id: "2", name: "Express", description: "", price: 599, freeOver: null, enabled: true },
    { id: "3", name: "Disabled", description: "", price: 0, freeOver: null, enabled: false },
  ];
  assert.equal(selectShippingMethod(methods)?.id, "1");
  assert.equal(selectShippingMethod(methods, "standard")?.id, "1");
  assert.equal(selectShippingMethod(methods, "2")?.id, "2");
  assert.equal(selectShippingMethod(methods, "3")?.id, "1");
  assert.equal(selectShippingMethod(methods, "removed")?.id, "1");
  assert.equal(selectShippingMethod([]), undefined);
});

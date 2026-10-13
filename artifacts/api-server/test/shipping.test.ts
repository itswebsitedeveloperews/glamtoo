import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import { calculateShippingAmount } from "@workspace/shipping";
import { listShippingMethods, resolveShippingMethod, serializeShippingMethod } from "../src/shippingMethods";

after(async () => { await pool.end(); });

test("payment delivery resolver agrees with storefront quotes using configured enabled methods", async () => {
  const methods = await listShippingMethods(true);
  assert.ok(methods.length, "At least one delivery method must be configured");
  for (const method of methods) {
    const publicMethod = serializeShippingMethod(method);
    const boundaries = new Set([1999, 7499, 7500, 7997, 9999, 10000]);
    if (method.freeOver !== null) {
      boundaries.add(Math.max(0, method.freeOver - 1));
      boundaries.add(method.freeOver);
    }
    for (const subtotal of boundaries) {
      const resolved = await resolveShippingMethod(publicMethod.id, subtotal);
      const expected = method.freeOver !== null && subtotal >= method.freeOver ? 0 : method.price;
      assert.equal(resolved.amount, expected, `${method.name} at ${subtotal}`);
      assert.equal(calculateShippingAmount(publicMethod, subtotal), resolved.amount);
      assert.equal(resolved.method.id, method.id);
    }
  }
});

test("payment resolver rejects unknown delivery methods instead of falling back to legacy rates", async () => {
  await assert.rejects(resolveShippingMethod("not-a-configured-shipping-method", 7997), /available delivery method/);
});

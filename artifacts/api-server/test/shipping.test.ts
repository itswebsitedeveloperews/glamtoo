import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db, pool, shippingMethodsTable, deliveryInformationTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateShippingAmount } from "@workspace/shipping";
import { listShippingMethods, resolveShippingMethod, serializeShippingMethod } from "../src/shippingMethods";
import { approvedDeliveryAdvice, deliveryServiceKey } from "../src/deliveryAdvice";
import { listDeliveryInformation, serializeDeliveryInformation } from "../src/deliveryInformation";

after(async () => { await pool.end(); });

test("approved product advice maps to existing service IDs without changing thresholds", () => {
  const advice = [
    { option: "UK Next Day", information: "Order before 8pm Mon - Thu.", cost: 599 },
    { option: "UK Saturday", information: "Order before 8pm Friday.", cost: 899 },
    { option: "UK Standard", information: "Arrives in 3-7 working days.", cost: 399 },
  ];
  assert.deepEqual(approvedDeliveryAdvice({ name: "UK Saturday Delivery", price: 1200, description: "" }, advice), {
    name: "UK Saturday", price: 899, description: "Order before 8pm Friday.",
  });
  assert.equal(approvedDeliveryAdvice({ name: "Standard", price: 399, description: "3-5 days" }, advice).description, "Arrives in 3-7 working days.");
  assert.equal(approvedDeliveryAdvice({ name: "Express", price: 599, description: "" }, advice).name, "UK Next Day");
  assert.deepEqual(approvedDeliveryAdvice({ name: "Custom courier", price: 2000, description: "" }, advice), {});
  assert.throws(() => approvedDeliveryAdvice({ name: "Standard", price: 399, description: "" }, [...advice, advice[2]]), /duplicate/);
});

test("product advice is an exact projection of enabled checkout methods", async () => {
  const methods = await listShippingMethods(true);
  const advice = (await listDeliveryInformation()).map(serializeDeliveryInformation);
  assert.equal(advice.length, methods.length);
  for (const method of methods) {
    const row = advice.find((item) => item.id === String(method.id));
    assert.ok(row);
    assert.equal(row.cost, method.price);
    assert.equal(row.information, method.description);
    assert.equal(row.option, method.name);
    assert.equal(row.freeOver, method.freeOver);
  }
  for (const legacyName of ["standard", "express"]) {
    const method = methods.find((item) => deliveryServiceKey(item.name) === deliveryServiceKey(legacyName));
    if (method) assert.equal((await resolveShippingMethod(legacyName, 1999)).method.id, method.id);
  }
});

test("future edits, disabled and deleted services cannot revive legacy product advice", async () => {
  const name = `Delivery consistency ${crypto.randomUUID()}`;
  const [legacy] = await db.insert(deliveryInformationTable).values({
    option: name, information: "Approved legacy promise", cost: 899, sortOrder: 1000,
  }).returning();
  const [fixture] = await db.insert(shippingMethodsTable).values({
    name, description: "Old checkout promise", price: 1200, freeOver: 10000,
    enabled: true, sortOrder: 1000, deliveryAdviceImported: false,
  }).returning();
  try {
    const imported = (await listShippingMethods()).find((item) => item.id === fixture.id);
    assert.equal(imported?.price, 899);
    assert.equal(imported?.description, "Approved legacy promise");
    assert.equal(imported?.freeOver, 10000);
    assert.equal(imported?.deliveryAdviceImported, true);
    await db.update(deliveryInformationTable).set({ cost: 500 }).where(eq(deliveryInformationTable.id, legacy.id));
    await db.update(shippingMethodsTable).set({ price: 1200, description: "Updated promise" }).where(eq(shippingMethodsTable.id, fixture.id));
    const row = (await listDeliveryInformation()).find((item) => item.id === fixture.id);
    assert.equal(row?.cost, 1200);
    assert.equal(row?.information, "Updated promise");
    assert.equal((await resolveShippingMethod(String(fixture.id), 1999)).amount, 1200);
    await db.update(shippingMethodsTable).set({ enabled: false }).where(eq(shippingMethodsTable.id, fixture.id));
    assert.ok(!(await listDeliveryInformation()).some((item) => item.id === fixture.id));
    await assert.rejects(resolveShippingMethod(String(fixture.id), 1999), /available delivery method/);
  } finally {
    await db.delete(shippingMethodsTable).where(eq(shippingMethodsTable.id, fixture.id));
    await db.delete(deliveryInformationTable).where(eq(deliveryInformationTable.id, legacy.id));
  }
  assert.ok(!(await listDeliveryInformation()).some((item) => item.id === fixture.id));
});

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

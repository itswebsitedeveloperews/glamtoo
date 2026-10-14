import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import { saveCatalog, getCatalogRecord } from "../src/routes/catalog";
import { getCheckoutCatalogLine, getInventoryLevels, reserveInventory, releaseInventoryReservation, syncCatalogProduct } from "../src/inventoryService";
import { createPendingOrder, attachOrderPayment, finalizePaidOrder } from "../src/orderService";

after(() => pool.end());

const simple = { id: 1791952756162, slug: "new-api-only", name: "New API-only", description: "", price: "£1.00", stock: 2, status: "Published", type: "Simple", variations: [], image: "" };
const variable = { ...simple, id: 1791952756163, slug: "variable-only", name: "Variable", type: "Variable", variations: [
  { id: 1, size: "S", colour: "", price: "£2.00", stock: 3 },
  { id: 2, size: "M", colour: "", price: "£3.00", stock: 4 },
] };
const builtin = { ...simple, id: 122, slug: "built-in", name: "Built-in" };
const save = (products: typeof simple[] | Array<Record<string, unknown>>, stockUpdates: string[] = []) => {
  const catalog = { products, categories: [] };
  return saveCatalog(catalog, catalog, "isolated-admin", false, stockUpdates);
};

test("catalog publication and retirement preserve payment and stock invariants", async (t) => {
  await t.test("publication makes API-only inventory available in the same commit", async () => {
    await save([simple, variable, builtin]);
    assert.equal((await getCheckoutCatalogLine(String(simple.id)))?.unitAmount, 100);
    assert.equal((await getInventoryLevels())[`${variable.id}:1`], 3);
  });
  await t.test("ordered galleries survive catalog saves; explicit empty galleries stay empty", async () => {
    const galleryImages = ["https://images.example/detail.jpg", "https://images.example/back.jpg", "https://images.example/front.jpg"];
    const galleryProduct = { ...simple, galleryImages };
    await save([galleryProduct, variable, builtin]);
    await save([{ ...galleryProduct, description: "An unrelated merchant edit" }, variable, builtin]);
    assert.deepEqual((await getCatalogRecord()).products[0].galleryImages, galleryImages);
    const oldClient = { ...simple, description: "Older editor omits gallery metadata" };
    await save([oldClient, variable, builtin]);
    assert.deepEqual((await getCatalogRecord()).products[0].galleryImages, galleryImages);
    await save([{ ...simple, galleryImages: [] }, variable, builtin]);
    await save([oldClient, variable, builtin]);
    assert.deepEqual((await getCatalogRecord()).products[0].galleryImages, []);
    assert.deepEqual((await getCatalogRecord()).products[1].galleryImages, undefined, "genuine single-image product remains unchanged");
  });
  await t.test("an inventory failure rolls back catalog and all stock changes", async () => {
    await assert.rejects(save([{ ...simple, stock: 9 }, { ...variable, variations: [{ ...variable.variations[0], price: "invalid" }] }], [String(simple.id)]));
    assert.equal((await getInventoryLevels())[simple.id], 2);
    assert.equal((await getInventoryLevels())[builtin.id], 2, "retirement must roll back too");
    assert.equal((await getCatalogRecord()).products.find((p) => p.id === simple.id)?.stock, 2);
  });
  const payment = `pi_isolated_${crypto.randomUUID()}`;
  let orderId: string;
  await t.test("reservation made before removal is retained", async () => {
    const order = await createPendingOrder({
      userId: "guest:isolated", email: "isolated@example.com", customerName: "Isolated Shopper", phone: "",
      address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
      delivery: "standard", subtotal: 100, deliveryAmount: 399, discountAmount: 0, total: 499, vatAmount: 83,
      expiresAt: new Date(Date.now() + 600000),
      items: [{ productId: String(simple.id), inventoryKey: String(simple.id), name: simple.name, quantity: 1, unitAmount: 100, total: 100 }],
    });
    orderId = order.id;
    await attachOrderPayment(orderId, payment, "payment_intent");
    await reserveInventory([{ productId: String(simple.id), inventoryKey: String(simple.id), name: simple.name, quantity: 1 }], payment);
  });
  await t.test("simple and variable removal retires only matching rows, without deleting stock/reservations", async () => {
    await save([builtin]);
    const levels = await getInventoryLevels();
    assert.equal(levels[simple.id], undefined);
    assert.equal(levels[`${variable.id}:1`], undefined);
    assert.equal(levels[`${variable.id}:2`], undefined);
    assert.equal(levels[builtin.id], 2);
    const rows = await pool.query("SELECT product_id, stock, active FROM product_inventory WHERE catalog_product_id=$1", [String(simple.id)]);
    assert.equal(rows.rows[0].stock, 1);
    assert.equal(rows.rows[0].active, false);
    assert.equal((await pool.query("SELECT 1 FROM inventory_reservations WHERE payment_reference=$1", [payment])).rowCount, 1);
    await assert.rejects(reserveInventory([{ productId: String(simple.id), inventoryKey: String(simple.id), name: simple.name, quantity: 1 }], `${payment}_late`), /not available/);
    assert.equal(await getCheckoutCatalogLine(String(simple.id)), null);
  });
  await t.test("in-flight finalization and duplicate callbacks still complete after removal", async () => {
    const paid = await finalizePaidOrder(orderId!, payment);
    assert.equal(paid?.paymentStatus, "paid");
    assert.equal(paid?.items[0].name, simple.name);
    await finalizePaidOrder(orderId!, payment);
    assert.equal((await pool.query("SELECT 1 FROM store_order_email_notifications WHERE order_id=$1 AND notification_type='order_confirmation'", [orderId!])).rowCount, 1);
    assert.equal((await pool.query("SELECT stock FROM product_inventory WHERE product_id=$1", [String(simple.id)])).rows[0].stock, 1);
  });
  await t.test("retries and delayed legacy inventory sync cannot resurrect a removed product", async () => {
    await save([builtin]);
    await assert.rejects(syncCatalogProduct({ ...simple, id: String(simple.id), status: "Published", type: "Simple" }), /removed/);
    await assert.rejects(save([simple, builtin]), /deleted catalog ID/);
    assert.equal((await getInventoryLevels())[simple.id], undefined);
  });
  await t.test("built-in deletion stays retired through repeated inventory seeding", async () => {
    await save([]);
    assert.equal((await getInventoryLevels())[builtin.id], undefined);
    assert.equal((await getInventoryLevels())[builtin.id], undefined);
    assert.equal(await getCheckoutCatalogLine(String(builtin.id)), null);
  });
  await t.test("metadata rename preserves explicit URL, history and reserved stock", async () => {
    const other = { ...simple, id: 1791952756165, slug: "keep-original-url", name: "Original", stock: 5 };
    await save([{ ...other, slug: "previous-test-url" }]);
    await save([other]);
    const ref = `${payment}_other`;
    await reserveInventory([{ productId: String(other.id), inventoryKey: String(other.id), quantity: 1, name: other.name }], ref);
    await save([{ ...other, name: "Merchant-approved test rename", description: "Test rename" }]);
    assert.equal((await getInventoryLevels())[other.id], 4);
    assert.equal((await getCatalogRecord()).products[0].slug, "keep-original-url");
    assert.deepEqual((await getCatalogRecord()).products[0].slugHistory, ["previous-test-url"]);
    await save([{ ...other, stock: 1, name: "Stale browser stock overlay" }]);
    assert.equal((await getInventoryLevels())[other.id], 4, "unrelated stale overlays cannot rewrite live stock");
    await save([{ ...other, stock: 6 }], [String(other.id)]);
    assert.equal((await getInventoryLevels())[other.id], 6, "an explicit admin stock edit still works");
    await save([]);
    await releaseInventoryReservation(ref);
    assert.equal((await pool.query("SELECT stock,active FROM product_inventory WHERE product_id=$1", [String(other.id)])).rows[0].stock, 7);
    assert.equal((await getInventoryLevels())[other.id], undefined);
  });
  await t.test("concurrent removal and reservation cannot reopen retired stock", async () => {
    const concurrent = { ...simple, id: 1791952756166, slug: "concurrent-removal" };
    await save([concurrent]);
    const ref = `${payment}_race`;
    const [reservation, removal] = await Promise.allSettled([
      reserveInventory([{ productId: String(concurrent.id), inventoryKey: String(concurrent.id), quantity: 1, name: concurrent.name }], ref),
      save([]),
    ]);
    assert.equal(removal.status, "fulfilled");
    const row = (await pool.query("SELECT stock, active FROM product_inventory WHERE product_id=$1", [String(concurrent.id)])).rows[0];
    assert.equal(row.active, false);
    assert.equal(row.stock, reservation.status === "fulfilled" ? 1 : 2);
    await releaseInventoryReservation(ref);
    assert.equal((await getInventoryLevels())[concurrent.id], undefined);
  });
});

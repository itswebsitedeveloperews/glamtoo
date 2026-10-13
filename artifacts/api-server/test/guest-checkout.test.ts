import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { before, after, test } from "node:test";
import { pool } from "@workspace/db";
import stripeRouter from "../src/routes/stripe";
import { intents, sessions, customers } from "./fixtures/guest-stripe";
import { guestCheckoutOwner, ownsCheckoutPayment } from "../src/checkoutIdentity";
import { listShippingMethods, resolveShippingMethod } from "../src/shippingMethods";

const runId = `guest_test_${crypto.randomUUID().replace(/-/g, "")}`;
let server: http.Server;
let origin: string;
let deliveryId: string;
let deliveryAmount: number;
let couponId: number;
let ownerCookie: string;
let paidIntent: any;

before(async () => {
  await pool.query(`INSERT INTO product_inventory (product_id,catalog_product_id,name,description,unit_amount,stock,active) VALUES ($1,$1,'Isolated guest checkout test','',1999,20,true)`, [runId]);
  const coupon = await pool.query<{ id: number }>(`INSERT INTO coupons (code,discount_type,discount_value,active,minimum_spend,usage_limit,usage_count) VALUES ($1,'fixed',500,true,0,10,0) RETURNING id`, [runId.toUpperCase()]);
  couponId = coupon.rows[0].id;
  const method = (await listShippingMethods(true))[0];
  deliveryId = String(method.id);
  deliveryAmount = (await resolveShippingMethod(deliveryId, 1999)).amount;
  const app = express();
  app.use(express.json());
  app.use("/api", stripeRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  const ids = [...intents.values(), ...sessions.values()].map((item) => item.metadata.glam_too_order_id);
  await pool.query("DELETE FROM inventory_reservations WHERE product_id = $1", [runId]);
  await pool.query("DELETE FROM store_order_items WHERE order_id = ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM store_orders WHERE id = ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM coupon_redemptions WHERE coupon_id = $1", [couponId]);
  await pool.query("DELETE FROM coupons WHERE id = $1", [couponId]);
  await pool.query("DELETE FROM product_inventory WHERE product_id = $1", [runId]);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

const input = () => ({
  email: `${runId}@example.com`, customerName: "Guest Test", phone: "",
  address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
  delivery: deliveryId, lines: [{ productId: runId, quantity: 1 }],
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}/api/stripe/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const stock = async () => Number((await pool.query("SELECT stock FROM product_inventory WHERE product_id=$1", [runId])).rows[0].stock);

test("anonymous checkout creates a real pending order with a hashed cookie owner and no saved-card consent", async () => {
  const response = await post("payment-intent", { ...input(), couponCode: runId });
  assert.equal(response.status, 200, (await response.clone().json()).error);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  ownerCookie = cookie.split(";")[0];
  const result = await response.json() as { paymentIntentId: string };
  paidIntent = intents.get(result.paymentIntentId);
  assert.equal(paidIntent.amount, 1999 + deliveryAmount - 500);
  assert.equal(paidIntent.customer, undefined);
  assert.equal(paidIntent.setup_future_usage, undefined);
  assert.equal(paidIntent.metadata.clerk_user_id, undefined);
  assert.equal(customers.size, 0, "A guest must not create or reuse an account customer by email");
  const token = ownerCookie.split("=")[1];
  assert.equal(paidIntent.metadata.guest_checkout_id, guestCheckoutOwner(token));
  assert.ok(!JSON.stringify(paidIntent.metadata).includes(token));
  const row = (await pool.query("SELECT user_id,payment_status FROM store_orders WHERE id=$1", [paidIntent.metadata.glam_too_order_id])).rows[0];
  assert.equal(row.user_id, guestCheckoutOwner(token));
  assert.equal(row.payment_status, "pending");
});

test("guest confirmation and cancellation reject missing or unrelated browsers, even with a known payment ID or metadata hash", async () => {
  const reservedStock = await stock();
  paidIntent.status = "succeeded";
  assert.equal((await post("finalize-payment", { paymentIntentId: paidIntent.id })).status, 401);
  const unrelated = await post("payment-intent", {});
  const otherCookie = unrelated.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await post("finalize-payment", { paymentIntentId: paidIntent.id }, { Cookie: otherCookie })).status, 400);
  const guessedCookie = `glam_too_guest_checkout=${paidIntent.metadata.guest_checkout_id.slice(6)}`;
  assert.equal((await post("finalize-payment", { paymentIntentId: paidIntent.id }, { Cookie: guessedCookie })).status, 400);
  assert.equal((await post("abandon-payment", { paymentIntentId: paidIntent.id }, { Cookie: otherCookie })).status, 400);
  assert.equal(await stock(), reservedStock);
});

test("owned guest payment finalizes idempotently with stock and coupon settled exactly once", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await post("finalize-payment", { paymentIntentId: paidIntent.id }, { Cookie: ownerCookie });
    assert.equal(response.status, 200);
    const result = await response.json() as { order: { paymentStatus: string; total: number; delivery: { method: string } } };
    assert.equal(result.order.paymentStatus, "paid");
    assert.equal(result.order.total, paidIntent.amount);
    assert.equal(result.order.delivery.method, (await listShippingMethods(true))[0].name);
  }
  assert.equal(await stock(), 19);
  assert.equal(Number((await pool.query("SELECT usage_count FROM coupons WHERE id=$1", [couponId])).rows[0].usage_count), 1);
});

test("guest retry cancellation releases its reservation; saved cards and cross-site origins remain forbidden", async () => {
  const before = intents.size;
  assert.equal((await post("payment-intent", { ...input(), paymentMethodId: "pm_someone" }, { Cookie: ownerCookie })).status, 403);
  assert.equal(intents.size, before);
  assert.equal((await post("payment-intent", input(), { Origin: "https://attacker.example", Cookie: ownerCookie })).status, 403);
  const response = await post("payment-intent", input(), { Cookie: ownerCookie, Origin: origin });
  assert.equal(response.status, 200);
  const pending = await response.json() as { paymentIntentId: string };
  assert.equal((await post("abandon-payment", { paymentIntentId: pending.paymentIntentId }, { Cookie: ownerCookie })).status, 200);
  assert.equal(intents.get(pending.paymentIntentId).status, "canceled");
  assert.equal((await pool.query("SELECT count(*) AS count FROM inventory_reservations WHERE payment_reference=$1", [pending.paymentIntentId])).rows[0].count, "0");
});

test("signed-in payments still use the authenticated account, never the guest email or cookie as account ownership", async () => {
  const response = await post("payment-intent", input(), { Cookie: ownerCookie, "x-test-user": "user_checkout_test" });
  assert.equal(response.status, 200);
  const result = await response.json() as { paymentIntentId: string };
  const intent = intents.get(result.paymentIntentId);
  assert.equal(intent.metadata.clerk_user_id, "user_checkout_test");
  assert.equal(intent.metadata.guest_checkout_id, undefined);
  assert.ok(intent.customer);
  assert.equal(intent.setup_future_usage, "off_session");
  assert.equal(ownsCheckoutPayment(intent.metadata, null, guestCheckoutOwner(ownerCookie.split("=")[1])), false);
  intent.status = "succeeded";
  assert.equal((await post("finalize-payment", { paymentIntentId: intent.id }, { "x-test-user": "user_checkout_test" })).status, 200);
});

test("hosted checkout also permits guests and verifies their browser on confirmation", async () => {
  const response = await post("checkout", input(), { Cookie: ownerCookie });
  assert.equal(response.status, 200);
  const session = [...sessions.values()].at(-1)!;
  assert.equal(session.metadata.clerk_user_id, undefined);
  assert.equal(session.metadata.guest_checkout_id, guestCheckoutOwner(ownerCookie.split("=")[1]));
  session.payment_status = "paid";
  assert.equal((await post("finalize-payment", { checkoutSessionId: session.id }, { Cookie: ownerCookie })).status, 200);
});

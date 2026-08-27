import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import {
  cancelPendingOrder,
  createPendingOrder,
  finalizePaidOrder,
} from "../src/orderService";
import { reconcileLegacyOrders } from "../src/routes/stripe";

const runId = `task18_${crypto.randomUUID().replace(/-/g, "")}`;
const createdProducts: string[] = [];
const createdCoupons: number[] = [];
const createdOrders: string[] = [];

function pendingOrderInput(productId: string, couponId: number) {
  return {
    userId: `${runId}_user`,
    email: `${runId}@example.com`,
    customerName: "Task 18 Test Shopper",
    phone: "",
    address: {
      line1: "1 Test Street",
      city: "London",
      postcode: "SW1A 1AA",
      country: "GB",
    },
    delivery: "standard" as const,
    subtotal: 5000,
    deliveryAmount: 0,
    discountAmount: 500,
    total: 4500,
    coupon: { id: couponId, code: `${runId}_coupon` },
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    items: [{
      productId,
      inventoryKey: productId,
      name: "Task 18 test product",
      quantity: 2,
      unitAmount: 2500,
      total: 5000,
    }],
  };
}

async function createPaymentFixture(label: string) {
  const productId = `${runId}_${label}_product`;
  const paymentReference = `pi_${runId}_${label}`;
  createdProducts.push(productId);
  await pool.query(
    `INSERT INTO product_inventory
      (product_id, catalog_product_id, variation_id, name, description, unit_amount, stock, active)
     VALUES ($1, $1, NULL, 'Task 18 test product', '', 2500, 7, true)`,
    [productId],
  );
  const coupon = await pool.query<{ id: number }>(
    `INSERT INTO coupons
      (code, discount_type, discount_value, active, minimum_spend, usage_limit, usage_count)
     VALUES ($1, 'fixed', 500, true, 0, 10, 0)
     RETURNING id`,
    [`${runId}_${label}_coupon`],
  );
  const couponId = coupon.rows[0].id;
  createdCoupons.push(couponId);
  const order = await createPendingOrder(pendingOrderInput(productId, couponId));
  createdOrders.push(order.id);
  await pool.query(
    `UPDATE store_orders SET coupon_code = $2 WHERE id = $1`,
    [order.id, `${runId}_${label}_coupon`],
  );
  const { reserveInventory } = await import("../src/inventoryService");
  const { reserveCouponRedemption } = await import("../src/couponService");
  await reserveInventory([{
    inventoryKey: productId,
    productId,
    quantity: 2,
    name: "Task 18 test product",
  }], paymentReference);
  const couponRow = await pool.query<{
    id: number;
    code: string;
    discount_type: "fixed";
    discount_value: number;
    active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    minimum_spend: number;
    usage_limit: number | null;
    usage_count: number;
    created_at: Date;
    updated_at: Date;
  }>("SELECT * FROM coupons WHERE id = $1", [couponId]);
  await reserveCouponRedemption({
    id: couponRow.rows[0].id,
    code: couponRow.rows[0].code,
    discountType: couponRow.rows[0].discount_type,
    discountValue: couponRow.rows[0].discount_value,
    active: couponRow.rows[0].active,
    startsAt: couponRow.rows[0].starts_at,
    endsAt: couponRow.rows[0].ends_at,
    minimumSpend: couponRow.rows[0].minimum_spend,
    usageLimit: couponRow.rows[0].usage_limit,
    usageCount: couponRow.rows[0].usage_count,
    createdAt: couponRow.rows[0].created_at,
    updatedAt: couponRow.rows[0].updated_at,
  }, paymentReference, `${runId}_user`, new Date(Date.now() + 30 * 60 * 1000));
  return { orderId: order.id, productId, couponId, paymentReference };
}

test("repeated paid callbacks settle an order, inventory, and coupon once", async () => {
  const fixture = await createPaymentFixture("duplicate");
  const results = await Promise.all(
    Array.from({ length: 5 }, () => finalizePaidOrder(
      fixture.orderId,
      fixture.paymentReference,
      { email: `${runId}@example.com`, customerName: "Task 18 Test Shopper" },
    )),
  );

  assert.equal(results.length, 5);
  assert.ok(results.every((order) => order?.paymentStatus === "paid"));
  const orderCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM store_orders WHERE id = $1 AND payment_status = 'paid'",
    [fixture.orderId],
  );
  const inventory = await pool.query<{ stock: number }>(
    "SELECT stock FROM product_inventory WHERE product_id = $1",
    [fixture.productId],
  );
  const reservations = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM inventory_reservations WHERE payment_reference = $1",
    [fixture.paymentReference],
  );
  const redemptions = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE payment_reference = $1",
    [fixture.paymentReference],
  );
  const coupon = await pool.query<{ usage_count: number }>(
    "SELECT usage_count FROM coupons WHERE id = $1",
    [fixture.couponId],
  );
  assert.equal(orderCount.rows[0].count, "1");
  assert.equal(inventory.rows[0].stock, 5);
  assert.equal(reservations.rows[0].count, "0");
  assert.equal(redemptions.rows[0].count, "1");
  assert.equal(coupon.rows[0].usage_count, 1);
});

test("a paid result wins when cancellation races with finalization", async () => {
  const fixture = await createPaymentFixture("race");
  await cancelPendingOrder(fixture.orderId, fixture.paymentReference);
  const order = await finalizePaidOrder(fixture.orderId, fixture.paymentReference, { email: `${runId}@example.com` });
  const state = await pool.query<{ payment_status: string; stock: number; usage_count: number; redemptions: string }>(
    `SELECT orders.payment_status, inventory.stock, coupons.usage_count,
       (SELECT COUNT(*) FROM coupon_redemptions WHERE payment_reference = $2)::text AS redemptions
     FROM store_orders AS orders
     JOIN product_inventory AS inventory ON inventory.product_id = $3
     JOIN coupons ON coupons.id = $4
     WHERE orders.id = $1`,
    [fixture.orderId, fixture.paymentReference, fixture.productId, fixture.couponId],
  );
  assert.equal(order?.paymentStatus, "paid");
  assert.equal(state.rows[0].payment_status, "paid");
  assert.equal(state.rows[0].stock, 5);
  assert.equal(state.rows[0].usage_count, 1);
  assert.equal(state.rows[0].redemptions, "1");
});

test("a late paid callback rolls back when released inventory was reallocated", async () => {
  const fixture = await createPaymentFixture("reallocated-stock");
  await cancelPendingOrder(fixture.orderId, fixture.paymentReference);
  await pool.query("UPDATE product_inventory SET stock = 1 WHERE product_id = $1", [fixture.productId]);

  await assert.rejects(() => finalizePaidOrder(fixture.orderId, fixture.paymentReference));
  const state = await pool.query<{ payment_status: string; stock: number; redemptions: string }>(
    `SELECT orders.payment_status, inventory.stock,
       (SELECT COUNT(*) FROM coupon_redemptions WHERE payment_reference = $2)::text AS redemptions
     FROM store_orders AS orders
     JOIN product_inventory AS inventory ON inventory.product_id = $3
     WHERE orders.id = $1`,
    [fixture.orderId, fixture.paymentReference, fixture.productId],
  );
  assert.equal(state.rows[0].payment_status, "cancelled");
  assert.equal(state.rows[0].stock, 1);
  assert.equal(state.rows[0].redemptions, "0");
});

test("a late paid callback rolls back when its coupon capacity was reused", async () => {
  const fixture = await createPaymentFixture("reallocated-coupon");
  await cancelPendingOrder(fixture.orderId, fixture.paymentReference);
  await pool.query("UPDATE coupons SET usage_count = usage_limit WHERE id = $1", [fixture.couponId]);

  await assert.rejects(() => finalizePaidOrder(fixture.orderId, fixture.paymentReference));
  const state = await pool.query<{ payment_status: string; stock: number; usage_count: number; redemptions: string }>(
    `SELECT orders.payment_status, inventory.stock, coupons.usage_count,
       (SELECT COUNT(*) FROM coupon_redemptions WHERE payment_reference = $2)::text AS redemptions
     FROM store_orders AS orders
     JOIN product_inventory AS inventory ON inventory.product_id = $3
     JOIN coupons ON coupons.id = $4
     WHERE orders.id = $1`,
    [fixture.orderId, fixture.paymentReference, fixture.productId, fixture.couponId],
  );
  assert.equal(state.rows[0].payment_status, "cancelled");
  assert.equal(state.rows[0].stock, 7);
  assert.equal(state.rows[0].usage_count, 10);
  assert.equal(state.rows[0].redemptions, "0");
});

test("legacy reconciliation advances through checkout-session and PaymentIntent pages", async () => {
  const session = (id: string, created: number) => ({
    id,
    created,
    amount_total: 5000,
    currency: "gbp",
    customer_email: `${id}@example.com`,
    customer_details: { name: "Legacy Shopper", email: `${id}@example.com`, address: {} },
    shipping_details: { name: "Legacy Shopper", address: {} },
    metadata: { store: "Glam Too", clerk_user_id: `${runId}_legacy` },
    fulfillment_status: "Processing" as const,
    items: [],
  });
  const paymentIntent = (id: string, created: number) => ({
    id,
    object: "payment_intent" as const,
    amount: 5000,
    amount_received: 5000,
    currency: "gbp",
    created,
    status: "succeeded" as const,
    metadata: { store: "Glam Too", clerk_user_id: `${runId}_legacy` },
    receipt_email: `${id}@example.com`,
    shipping: null,
  });
  const sessions = Array.from({ length: 51 }, (_, index) => session(`${runId}_cs_${index}`, index));
  const paymentIntents = Array.from({ length: 101 }, (_, index) => paymentIntent(`pi_${runId}_${index}`, index));
  const state = new Map<string, { cursor: string | null; completed: boolean }>([
    ["checkout_sessions", { cursor: null, completed: false }],
    ["payment_intents", { cursor: null, completed: false }],
  ]);
  const imported: string[] = [];
  const checkoutCursors: Array<string | undefined> = [];
  const paymentIntentCursors: Array<string | undefined> = [];

  const dependencies = {
    getState: async (source: string) => state.get(source) ?? { cursor: null, completed: false },
    saveState: async (source: string, cursor: string | null, completed: boolean) => {
      state.set(source, { cursor, completed });
    },
    queryCheckoutSessions: async (query: { values: Array<string | number> }) => {
      const cursor = query.values.find((value) => value === sessions[49].id) as string | undefined;
      checkoutCursors.push(cursor);
      return { rows: cursor ? sessions.slice(50) : sessions.slice(0, 50) };
    },
    getStripe: async () => ({
      paymentIntents: {
        list: async (params: { starting_after?: string }) => {
          paymentIntentCursors.push(params.starting_after);
          const start = params.starting_after ? 100 : 0;
          return {
            data: paymentIntents.slice(start, start + 100),
            has_more: start === 0,
          };
        },
      },
    }),
    getFulfillmentStatuses: async () => ({ rows: [] }),
    importLegacyPaidOrder: async (input: { paymentReference: string }) => {
      imported.push(input.paymentReference);
      return true;
    },
  } as Parameters<typeof reconcileLegacyOrders>[0];

  while (![...state.values()].every((value) => value.completed)) {
    await reconcileLegacyOrders(dependencies);
  }

  assert.deepEqual(checkoutCursors, [undefined, sessions[49].id]);
  assert.deepEqual(paymentIntentCursors, [undefined, paymentIntents[99].id]);
  assert.equal(imported.filter((id) => id.startsWith(`${runId}_cs_`)).length, 51);
  assert.equal(imported.filter((id) => id.startsWith(`pi_${runId}_`)).length, 101);
});

test("legacy checkout-session reconciliation traverses tied and missing timestamps", async () => {
  const session = (id: string, created: number | null) => ({
    id,
    created,
    amount_total: 5000,
    currency: "gbp",
    customer_email: `${id}@example.com`,
    customer_details: { name: "Legacy Shopper", email: `${id}@example.com`, address: {} },
    shipping_details: { name: "Legacy Shopper", address: {} },
    metadata: { store: "Glam Too", clerk_user_id: `${runId}_legacy` },
    fulfillment_status: "Processing" as const,
    items: [],
  });
  const timestampedPage = Array.from({ length: 50 }, (_, index) =>
    session(`${runId}_tied_${String(99 - index).padStart(3, "0")}`, 100),
  );
  const nullTimestampPage = Array.from({ length: 50 }, (_, index) =>
    session(`${runId}_null_${String(99 - index).padStart(3, "0")}`, null),
  );
  const finalNullTimestamp = session(`${runId}_null_final`, null);
  const state = new Map<string, { cursor: string | null; completed: boolean }>([
    ["checkout_sessions", { cursor: null, completed: false }],
    ["payment_intents", { cursor: null, completed: true }],
  ]);
  const queries: Array<{ text: string; values: Array<string | number> }> = [];
  const imported: string[] = [];
  const dependencies = {
    getState: async (source: string) => state.get(source) ?? { cursor: null, completed: false },
    saveState: async (source: string, cursor: string | null, completed: boolean) => {
      state.set(source, { cursor, completed });
    },
    queryCheckoutSessions: async (query: { text: string; values: Array<string | number> }) => {
      queries.push(query);
      if (query.values.includes(nullTimestampPage[49].id)) return { rows: [finalNullTimestamp] };
      if (query.values.includes(timestampedPage[49].id)) return { rows: nullTimestampPage };
      return { rows: timestampedPage };
    },
    getStripe: async () => {
      throw new Error("PaymentIntent reconciliation is already complete.");
    },
    getFulfillmentStatuses: async () => ({ rows: [] }),
    importLegacyPaidOrder: async (input: { paymentReference: string }) => {
      imported.push(input.paymentReference);
      return true;
    },
  } as Parameters<typeof reconcileLegacyOrders>[0];

  while (!state.get("checkout_sessions")?.completed) {
    await reconcileLegacyOrders(dependencies);
  }

  assert.match(queries[1].text, /OR sessions\.created IS NULL/);
  assert.match(queries[2].text, /sessions\.created IS NULL AND sessions\.id </);
  assert.equal(imported.length, 101);
  assert.equal(imported.at(-1), finalNullTimestamp.id);
});

test("legacy checkout-session reconciliation upgrades a numeric offset cursor", async () => {
  const session = (id: string, created: number) => ({
    id,
    created,
    amount_total: 5000,
    currency: "gbp",
    customer_email: `${id}@example.com`,
    customer_details: { name: "Legacy Shopper", email: `${id}@example.com`, address: {} },
    shipping_details: { name: "Legacy Shopper", address: {} },
    metadata: { store: "Glam Too", clerk_user_id: `${runId}_legacy` },
    fulfillment_status: "Processing" as const,
    items: [],
  });
  const oldOffsetPage = Array.from({ length: 50 }, (_, index) => session(`${runId}_offset_${index}`, 50 - index));
  const finalPage = [session(`${runId}_offset_final`, 0)];
  const state = new Map<string, { cursor: string | null; completed: boolean }>([
    ["checkout_sessions", { cursor: "50", completed: false }],
    ["payment_intents", { cursor: null, completed: true }],
  ]);
  const queries: Array<{ text: string; values: Array<string | number> }> = [];
  const dependencies = {
    getState: async (source: string) => state.get(source) ?? { cursor: null, completed: false },
    saveState: async (source: string, cursor: string | null, completed: boolean) => {
      state.set(source, { cursor, completed });
    },
    queryCheckoutSessions: async (query: { text: string; values: Array<string | number> }) => {
      queries.push(query);
      return query.values.includes(oldOffsetPage[49].id) ? { rows: finalPage } : { rows: oldOffsetPage };
    },
    getStripe: async () => {
      throw new Error("PaymentIntent reconciliation is already complete.");
    },
    getFulfillmentStatuses: async () => ({ rows: [] }),
    importLegacyPaidOrder: async () => true,
  } as Parameters<typeof reconcileLegacyOrders>[0];

  while (!state.get("checkout_sessions")?.completed) {
    await reconcileLegacyOrders(dependencies);
  }

  assert.match(queries[0].text, /OFFSET/);
  assert.deepEqual(queries[0].values, [50, 50]);
  assert.doesNotMatch(queries[1].text, /OFFSET/);
});

after(async () => {
  await pool.query("DELETE FROM inventory_reservations WHERE payment_reference LIKE $1", [`pi_${runId}%`]);
  await pool.query("DELETE FROM coupon_redemptions WHERE payment_reference LIKE $1", [`pi_${runId}%`]);
  await pool.query("DELETE FROM coupon_reservations WHERE payment_reference LIKE $1", [`pi_${runId}%`]);
  if (createdOrders.length) {
    await pool.query("DELETE FROM store_orders WHERE id = ANY($1::text[])", [createdOrders]);
  }
  if (createdCoupons.length) {
    await pool.query("DELETE FROM coupons WHERE id = ANY($1::int[])", [createdCoupons]);
  }
  if (createdProducts.length) {
    await pool.query("DELETE FROM product_inventory WHERE product_id = ANY($1::text[])", [createdProducts]);
  }
  await pool.end();
});
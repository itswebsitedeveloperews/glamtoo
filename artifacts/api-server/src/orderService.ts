import { pool, type PoolClient } from "@workspace/db";

export type FulfillmentStatus = "Processing" | "Shipped" | "Delivered";
export type OrderPaymentType = "payment_intent" | "checkout_session";
export type OrderPaymentStatus = "pending" | "paid" | "cancelled";

export type OrderItemSnapshot = {
  productId: string;
  variationId?: string;
  inventoryKey?: string;
  name: string;
  quantity: number;
  unitAmount: number;
  total: number;
};

export type PendingOrderInput = {
  userId: string;
  email: string;
  customerName: string;
  phone: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    country: string;
  };
  delivery: "standard" | "express";
  subtotal: number;
  deliveryAmount: number;
  discountAmount: number;
  total: number;
  vatAmount: number;
  coupon?: {
    id: number;
    code: string;
  };
  expiresAt: Date;
  items: OrderItemSnapshot[];
};

export type PaidOrderDetails = {
  email?: string;
  customerName?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
};

type OrderRow = {
  id: string;
  user_id: string;
  payment_reference: string | null;
  payment_type: OrderPaymentType | null;
  payment_status: OrderPaymentStatus;
  fulfillment_status: FulfillmentStatus;
  email: string;
  customer_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postcode: string;
  country: string;
  delivery_method: string;
  subtotal: number;
  delivery_amount: number;
  discount_amount: number;
  total: number;
  vat_amount: number;
  currency: string;
  coupon_id: number | null;
  coupon_code: string | null;
  expires_at: Date;
  paid_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
};

type OrderItemRow = {
  order_id: string;
  product_id: string;
  variation_id: string | null;
  inventory_key: string | null;
  name: string;
  quantity: number;
  unit_amount: number;
  total: number;
};

export type StoredOrder = {
  id: string;
  stripeSessionId: string;
  placedAt: string | null;
  status: FulfillmentStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  currency: string;
  email: string;
  couponCode: string | null;
  discountAmount: number;
  vatAmount: number;
  delivery: {
    method: string;
    name: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      postcode: string;
      country: string;
    };
  };
  items: Array<{
    name: string;
    productId: string | null;
    variationId: string | null;
    quantity: number;
    total: number;
  }>;
};

export class OrderFinalizationError extends Error {
  statusCode = 409;
}

function publicOrderNumber(orderId: string) {
  return `#GM-${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;
}

function generatedOrderId() {
  return `ord_${crypto.randomUUID().replace(/-/g, "")}`;
}

function serializeOrder(row: OrderRow, items: OrderItemRow[]): StoredOrder {
  return {
    id: publicOrderNumber(row.id),
    stripeSessionId: row.payment_reference ?? "",
    placedAt: row.created_at?.toISOString() ?? null,
    status: row.fulfillment_status,
    paymentStatus: row.payment_status,
    total: row.total,
    vatAmount: row.vat_amount,
    currency: row.currency,
    email: row.email,
    couponCode: row.coupon_code,
    discountAmount: row.discount_amount,
    delivery: {
      method: row.delivery_method === "express" ? "Express delivery" : "Standard delivery",
      name: row.customer_name,
      address: {
        line1: row.address_line_1,
        line2: row.address_line_2,
        city: row.city,
        postcode: row.postcode,
        country: row.country,
      },
    },
    items: items.map((item) => ({
      name: item.name,
      productId: item.product_id || null,
      variationId: item.variation_id,
      quantity: item.quantity,
      total: item.total,
    })),
  };
}

async function loadOrder(client: PoolClient, clause: string, value: string) {
  const orderResult = await client.query<OrderRow>(
    `SELECT * FROM store_orders WHERE ${clause} = $1 LIMIT 1`,
    [value],
  );
  const order = orderResult.rows[0];
  if (!order) return null;
  const itemResult = await client.query<OrderItemRow>(
    "SELECT order_id, product_id, variation_id, inventory_key, name, quantity, unit_amount, total FROM store_order_items WHERE order_id = $1 ORDER BY id",
    [order.id],
  );
  return serializeOrder(order, itemResult.rows);
}

export async function createPendingOrder(input: PendingOrderInput) {
  const id = generatedOrderId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO store_orders (
        id, user_id, email, customer_name, phone, address_line_1, address_line_2,
        city, postcode, country, delivery_method, subtotal, delivery_amount,
        discount_amount, total, coupon_id, coupon_code, expires_at
        , vat_amount
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )`,
      [
        id,
        input.userId,
        input.email,
        input.customerName,
        input.phone,
        input.address.line1,
        input.address.line2 ?? "",
        input.address.city,
        input.address.postcode,
        input.address.country,
        input.delivery,
        input.subtotal,
        input.deliveryAmount,
        input.discountAmount,
        input.total,
        input.coupon?.id ?? null,
        input.coupon?.code ?? null,
        input.expiresAt,
        input.vatAmount,
      ],
    );
    for (const item of input.items) {
      await client.query(
        `INSERT INTO store_order_items (
          order_id, product_id, variation_id, inventory_key, name, quantity, unit_amount, total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          item.productId,
          item.variationId ?? null,
          item.inventoryKey ?? null,
          item.name,
          item.quantity,
          item.unitAmount,
          item.total,
        ],
      );
    }
    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function attachOrderPayment(orderId: string, paymentReference: string, paymentType: OrderPaymentType) {
  const result = await pool.query<{ id: string }>(
    `UPDATE store_orders
     SET payment_reference = $2, payment_type = $3, updated_at = NOW()
     WHERE id = $1
       AND payment_status = 'pending'
       AND (payment_reference IS NULL OR payment_reference = $2)
     RETURNING id`,
    [orderId, paymentReference, paymentType],
  );
  if (!result.rows[0]) {
    throw new OrderFinalizationError("This checkout could not be attached to its saved order.");
  }
}

export async function setOrderExpiration(orderId: string, expiresAt: Date) {
  await pool.query(
    `UPDATE store_orders
     SET expires_at = $2, updated_at = NOW()
     WHERE id = $1 AND payment_status = 'pending'`,
    [orderId, expiresAt],
  );
}

export async function listExpiredPendingPayments() {
  const result = await pool.query<{ id: string; payment_reference: string; payment_type: OrderPaymentType }>(
    `SELECT id, payment_reference, payment_type
     FROM store_orders
     WHERE payment_status = 'pending'
       AND payment_reference IS NOT NULL
       AND payment_type IS NOT NULL
       AND expires_at <= NOW()
     ORDER BY expires_at
     LIMIT 25`,
  );
  return result.rows;
}

export async function getReconciliationState(source: string) {
  const result = await pool.query<{ cursor: string | null; completed: number }>(
    "SELECT cursor, completed FROM order_reconciliation_state WHERE source = $1 LIMIT 1",
    [source],
  );
  const state = result.rows[0];
  return { cursor: state?.cursor ?? null, completed: Boolean(state?.completed) };
}

export async function saveReconciliationState(source: string, cursor: string | null, completed: boolean) {
  await pool.query(
    `INSERT INTO order_reconciliation_state (source, cursor, completed, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source) DO UPDATE
     SET cursor = EXCLUDED.cursor, completed = EXCLUDED.completed, updated_at = NOW()`,
    [source, cursor, completed ? 1 : 0],
  );
}

async function markCouponRedeemed(client: PoolClient, order: OrderRow, paymentReference: string) {
  if (!order.coupon_id) return;
  const existing = await client.query<{ id: number }>(
    "SELECT id FROM coupon_redemptions WHERE payment_reference = $1 LIMIT 1",
    [paymentReference],
  );
  if (!existing.rows[0]) {
    const coupon = await client.query<{ id: number }>(
      "SELECT id FROM coupons WHERE id = $1 FOR UPDATE",
      [order.coupon_id],
    );
    if (!coupon.rows[0]) {
      throw new OrderFinalizationError("The coupon for this paid order could not be recorded.");
    }
    await client.query(
      `INSERT INTO coupon_redemptions (coupon_id, payment_reference, user_id, discount_amount)
       VALUES ($1, $2, $3, $4)`,
      [order.coupon_id, paymentReference, order.user_id, order.discount_amount],
    );
    await client.query(
      "UPDATE coupons SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1",
      [order.coupon_id],
    );
  }
  await client.query("DELETE FROM coupon_reservations WHERE payment_reference = $1", [paymentReference]);
}

export async function finalizePaidOrder(
  orderId: string,
  paymentReference: string,
  details: PaidOrderDetails = {},
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<OrderRow>(
      "SELECT * FROM store_orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = locked.rows[0];
    if (!order) throw new OrderFinalizationError("This payment does not have a saved Glam Too order.");
    if (order.payment_reference && order.payment_reference !== paymentReference) {
      throw new OrderFinalizationError("This payment belongs to a different saved order.");
    }
    if (order.payment_status === "cancelled") {
      throw new OrderFinalizationError("This checkout was already cancelled.");
    }
    if (order.payment_status !== "paid") {
      await client.query(
        `UPDATE store_orders
         SET payment_reference = $2,
             payment_status = 'paid',
             email = COALESCE(NULLIF($3, ''), email),
             customer_name = COALESCE(NULLIF($4, ''), customer_name),
             phone = COALESCE(NULLIF($5, ''), phone),
             address_line_1 = COALESCE(NULLIF($6, ''), address_line_1),
             address_line_2 = COALESCE(NULLIF($7, ''), address_line_2),
             city = COALESCE(NULLIF($8, ''), city),
             postcode = COALESCE(NULLIF($9, ''), postcode),
             country = COALESCE(NULLIF($10, ''), country),
             paid_at = COALESCE(paid_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [
          order.id,
          paymentReference,
          details.email ?? "",
          details.customerName ?? "",
          details.phone ?? "",
          details.address?.line1 ?? "",
          details.address?.line2 ?? "",
          details.address?.city ?? "",
          details.address?.postcode ?? "",
          details.address?.country ?? "",
        ],
      );
      await client.query("DELETE FROM inventory_reservations WHERE payment_reference = $1", [paymentReference]);
      await markCouponRedeemed(client, order, paymentReference);
    }
    const finalOrder = await loadOrder(client, "id", order.id);
    await client.query("COMMIT");
    return finalOrder;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelPendingOrder(orderId: string | undefined, paymentReference: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<OrderRow>(
      `SELECT * FROM store_orders
       WHERE payment_reference = $1 OR ($2::text IS NOT NULL AND id = $2)
       LIMIT 1
       FOR UPDATE`,
      [paymentReference, orderId ?? null],
    );
    const order = locked.rows[0];
    if (!order) {
      await client.query("COMMIT");
      return { cancelled: false, paymentSucceeded: false };
    }
    if (order.payment_status === "paid") {
      await client.query("COMMIT");
      return { cancelled: false, paymentSucceeded: true };
    }
    if (order.payment_status !== "cancelled") {
      await client.query(
        `UPDATE store_orders
         SET payment_reference = COALESCE(payment_reference, $2), payment_status = 'cancelled',
             cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [order.id, paymentReference],
      );
      const reservations = await client.query<{ product_id: string; quantity: number }>(
        `DELETE FROM inventory_reservations
         WHERE payment_reference = $1
         RETURNING product_id, quantity`,
        [paymentReference],
      );
      for (const reservation of reservations.rows) {
        await client.query(
          "UPDATE product_inventory SET stock = stock + $2, updated_at = NOW() WHERE product_id = $1",
          [reservation.product_id, reservation.quantity],
        );
      }
      await client.query("DELETE FROM coupon_reservations WHERE payment_reference = $1", [paymentReference]);
    }
    await client.query("COMMIT");
    return { cancelled: true, paymentSucceeded: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listPaidOrders(userId?: string) {
  const client = await pool.connect();
  try {
    const orderResult = await client.query<OrderRow>(
      `SELECT * FROM store_orders
       WHERE payment_status = 'paid'
         ${userId ? "AND user_id = $1" : ""}
       ORDER BY paid_at DESC NULLS LAST, created_at DESC
       LIMIT 50`,
      userId ? [userId] : [],
    );
    if (orderResult.rows.length === 0) return [];
    const ids = orderResult.rows.map((order) => order.id);
    const itemResult = await client.query<OrderItemRow>(
      `SELECT order_id, product_id, variation_id, inventory_key, name, quantity, unit_amount, total
       FROM store_order_items
       WHERE order_id = ANY($1::text[])
       ORDER BY id`,
      [ids],
    );
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of itemResult.rows) {
      const items = itemsByOrder.get(item.order_id) ?? [];
      items.push(item);
      itemsByOrder.set(item.order_id, items);
    }
    return orderResult.rows.map((order) => serializeOrder(order, itemsByOrder.get(order.id) ?? []));
  } finally {
    client.release();
  }
}

export async function getPaidOrderByPaymentReference(paymentReference: string) {
  const client = await pool.connect();
  try {
    const order = await loadOrder(client, "payment_reference", paymentReference);
    return order?.paymentStatus === "paid" ? order : null;
  } finally {
    client.release();
  }
}

export async function updateOrderFulfillment(paymentReference: string, status: FulfillmentStatus) {
  const updated = await pool.query<{ id: string }>(
    `UPDATE store_orders
     SET fulfillment_status = $2, updated_at = NOW()
     WHERE payment_reference = $1 AND payment_status = 'paid'
     RETURNING id`,
    [paymentReference, status],
  );
  if (!updated.rows[0]) return null;
  return getPaidOrderByPaymentReference(paymentReference);
}

export async function importLegacyPaidOrder(input: PendingOrderInput & {
  id: string;
  paymentReference: string;
  paymentType: OrderPaymentType;
  placedAt: Date;
  fulfillmentStatus?: FulfillmentStatus;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO store_orders (
        id, user_id, payment_reference, payment_type, payment_status, fulfillment_status,
        email, customer_name, phone, address_line_1, address_line_2, city, postcode, country,
        delivery_method, subtotal, delivery_amount, discount_amount, total, coupon_id, coupon_code,
        expires_at, vat_amount, paid_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'paid', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $24, $24
      ) ON CONFLICT (payment_reference) DO NOTHING RETURNING id`,
      [
        input.id, input.userId, input.paymentReference, input.paymentType,
        input.fulfillmentStatus ?? "Processing", input.email, input.customerName, input.phone,
        input.address.line1, input.address.line2 ?? "", input.address.city, input.address.postcode,
        input.address.country, input.delivery, input.subtotal, input.deliveryAmount,
        input.discountAmount, input.total, input.coupon?.id ?? null, input.coupon?.code ?? null,
        input.expiresAt, input.vatAmount, input.placedAt,
      ],
    );
    if (inserted.rows[0]) {
      for (const item of input.items) {
        await client.query(
          `INSERT INTO store_order_items (
            order_id, product_id, variation_id, inventory_key, name, quantity, unit_amount, total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            input.id, item.productId, item.variationId ?? null, item.inventoryKey ?? null,
            item.name, item.quantity, item.unitAmount, item.total,
          ],
        );
      }
    }
    await client.query("COMMIT");
    return Boolean(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
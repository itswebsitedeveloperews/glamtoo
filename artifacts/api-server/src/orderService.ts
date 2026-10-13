import { pool, type PoolClient } from "@workspace/db";

export type FulfillmentStatus = "Processing" | "Shipped" | "Delivered";
export type OrderPaymentType = "payment_intent" | "checkout_session";
export type OrderPaymentStatus = "pending" | "paid" | "cancelled";
export type PaymentResolution = "none" | "refund_pending" | "refund_processing" | "refunded" | "manual_resolution";
export type PaymentResolutionReason = "inventory_reallocated" | "coupon_reallocated" | "inventory_and_coupon_reallocated";

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
  delivery: string;
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
  payment_resolution: PaymentResolution;
  payment_resolution_reason: PaymentResolutionReason | null;
  payment_resolved_at: Date | null;
  stripe_refund_id: string | null;
  refund_attempt: number;
  refund_idempotency_key: string | null;
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
  paymentResolution: PaymentResolution;
  paymentResolutionReason: PaymentResolutionReason | null;
  paymentResolvedAt: string | null;
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

export function publicOrderNumber(orderId: string) {
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
    paymentResolution: row.payment_resolution,
    paymentResolutionReason: row.payment_resolution_reason,
    paymentResolvedAt: row.payment_resolved_at?.toISOString() ?? null,
    total: row.total,
    vatAmount: row.vat_amount,
    currency: row.currency,
    email: row.email,
    couponCode: row.coupon_code,
    discountAmount: row.discount_amount,
    delivery: {
      method: row.delivery_method === "express" ? "Express delivery" : row.delivery_method === "standard" ? "Standard delivery" : row.delivery_method,
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
     RETURNING id, refund_attempt, refund_idempotency_key`,
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
  const result = await pool.query<{ id: string; payment_reference: string | null; payment_type: OrderPaymentType | null }>(
    `SELECT id, payment_reference, payment_type
     FROM store_orders
     WHERE payment_status = 'pending'
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
    const coupon = await client.query<{ id: number; usage_limit: number | null; usage_count: number }>(
      "SELECT id, usage_limit, usage_count FROM coupons WHERE id = $1 FOR UPDATE",
      [order.coupon_id],
    );
    const couponRow = coupon.rows[0];
    if (!couponRow) {
      throw new OrderFinalizationError("The coupon for this paid order could not be recorded.");
    }
    if (couponRow.usage_limit !== null && couponRow.usage_count >= couponRow.usage_limit) {
      throw new OrderFinalizationError("This paid order's coupon allocation is no longer available.");
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

async function cancelledOrderCapacityIssue(client: PoolClient, order: OrderRow): Promise<PaymentResolutionReason | null> {
  let inventoryUnavailable = false;
  const items = await client.query<{ inventory_key: string | null; quantity: number }>(
    `SELECT inventory_key, SUM(quantity)::int AS quantity
     FROM store_order_items
     WHERE order_id = $1 AND inventory_key IS NOT NULL
     GROUP BY inventory_key
     ORDER BY inventory_key`,
    [order.id],
  );
  for (const item of items.rows) {
    const inventory = await client.query<{ stock: number }>(
      "SELECT stock FROM product_inventory WHERE product_id = $1 FOR UPDATE",
      [item.inventory_key],
    );
    if (inventory.rows[0]?.stock === undefined || inventory.rows[0].stock < item.quantity) inventoryUnavailable = true;
  }

  let couponUnavailable = false;
  if (order.coupon_id) {
    const coupon = await client.query<{ usage_limit: number | null; usage_count: number }>(
      "SELECT usage_limit, usage_count FROM coupons WHERE id = $1 FOR UPDATE",
      [order.coupon_id],
    );
    const couponRow = coupon.rows[0];
    if (!couponRow || (couponRow.usage_limit !== null && couponRow.usage_count >= couponRow.usage_limit)) {
      couponUnavailable = true;
    }
  }

  if (inventoryUnavailable && couponUnavailable) return "inventory_and_coupon_reallocated";
  if (inventoryUnavailable) return "inventory_reallocated";
  if (couponUnavailable) return "coupon_reallocated";
  return null;
}

async function settleCancelledOrderInventory(client: PoolClient, orderId: string) {
  const items = await client.query<{ inventory_key: string | null; quantity: number }>(
    `SELECT inventory_key, SUM(quantity)::int AS quantity
     FROM store_order_items
     WHERE order_id = $1 AND inventory_key IS NOT NULL
     GROUP BY inventory_key
     ORDER BY inventory_key`,
    [orderId],
  );
  for (const item of items.rows) {
    await client.query(
      `UPDATE product_inventory
       SET stock = stock - $2, updated_at = NOW()
       WHERE product_id = $1`,
      [item.inventory_key, item.quantity],
    );
  }
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
    if (order.payment_status === "cancelled" && order.payment_resolution !== "none") {
      const existingOrder = await loadOrder(client, "id", order.id);
      await client.query("COMMIT");
      return existingOrder;
    }
    const wasCancelled = order.payment_status === "cancelled";
    if (order.payment_status !== "paid") {
      if (wasCancelled) {
        const capacityIssue = await cancelledOrderCapacityIssue(client, order);
        if (capacityIssue) {
          await client.query(
            `UPDATE store_orders
             SET payment_reference = COALESCE(payment_reference, $2),
                 payment_resolution = 'refund_pending',
                 payment_resolution_reason = $3,
                 payment_resolved_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [order.id, paymentReference, capacityIssue],
          );
          const unresolvedOrder = await loadOrder(client, "id", order.id);
          await client.query("COMMIT");
          return unresolvedOrder;
        }
      }
      await client.query(
        `UPDATE store_orders
         SET payment_reference = $2,
             payment_status = 'paid',
             payment_resolution = 'none',
             payment_resolution_reason = NULL,
             payment_resolved_at = NULL,
             email = COALESCE(NULLIF($3, ''), email),
             customer_name = COALESCE(NULLIF($4, ''), customer_name),
             phone = COALESCE(NULLIF($5, ''), phone),
             address_line_1 = COALESCE(NULLIF($6, ''), address_line_1),
             address_line_2 = COALESCE(NULLIF($7, ''), address_line_2),
             city = COALESCE(NULLIF($8, ''), city),
             postcode = COALESCE(NULLIF($9, ''), postcode),
             country = COALESCE(NULLIF($10, ''), country),
             paid_at = COALESCE(paid_at, NOW()),
              cancelled_at = CASE WHEN payment_status = 'cancelled' THEN NULL ELSE cancelled_at END,
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
      if (wasCancelled) {
        await settleCancelledOrderInventory(client, order.id);
      }
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

export async function cancelPendingOrder(orderId: string | undefined, paymentReference?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<OrderRow>(
      `SELECT * FROM store_orders
       WHERE payment_reference = $1 OR ($2::text IS NOT NULL AND id = $2)
       LIMIT 1
       FOR UPDATE`,
      [paymentReference ?? null, orderId ?? null],
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
         [order.id, paymentReference ?? null],
      );
      const reservations = await client.query<{ product_id: string; quantity: number }>(
        `DELETE FROM inventory_reservations
          WHERE payment_reference = ANY($1::text[])
         RETURNING product_id, quantity`,
        [[...new Set([order.payment_reference, paymentReference].filter((reference): reference is string => Boolean(reference)))]],
      );
      for (const reservation of reservations.rows) {
        await client.query(
          "UPDATE product_inventory SET stock = stock + $2, updated_at = NOW() WHERE product_id = $1",
          [reservation.product_id, reservation.quantity],
        );
      }
      await client.query(
        "DELETE FROM coupon_reservations WHERE payment_reference = ANY($1::text[])",
        [[...new Set([order.payment_reference, paymentReference].filter((reference): reference is string => Boolean(reference)))]],
      );
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
       WHERE (
         payment_status = 'paid'
         OR (payment_status = 'cancelled' AND payment_resolution <> 'none')
       )
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

export async function getProductSales() {
  const result = await pool.query<{ product_id: string; units_sold: string }>(
    `SELECT items.product_id, SUM(items.quantity)::integer AS units_sold
     FROM store_order_items items
     INNER JOIN store_orders orders ON orders.id = items.order_id
     WHERE orders.payment_status = 'paid'
     GROUP BY items.product_id`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.product_id, Number(row.units_sold)]));
}

export async function getPaidOrderByPaymentReference(paymentReference: string) {
  const client = await pool.connect();
  try {
    const order = await loadOrder(client, "payment_reference", paymentReference);
    return order && (order.paymentStatus === "paid" || order.paymentResolution !== "none") ? order : null;
  } finally {
    client.release();
  }
}

export async function recordPaymentResolution(
  orderId: string,
  resolution: "manual_resolution",
) {
  const result = await pool.query<{ id: string }>(
    `WITH changed AS (
       UPDATE store_orders
       SET payment_resolution = $2,
           payment_resolved_at = COALESCE(payment_resolved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
         AND payment_status = 'cancelled'
         AND payment_resolution = 'refund_pending'
       RETURNING id
     )
     , queued AS (
       INSERT INTO store_order_email_notifications (order_id, notification_type)
       SELECT id, $2 FROM changed
       ON CONFLICT (order_id, notification_type) DO NOTHING
     )
     SELECT id FROM changed`,
    [orderId, resolution],
  );
  if (!result.rows[0]) return null;
  return getOrderById(orderId);
}

export async function recordPaymentResolutionByPaymentReference(
  paymentReference: string,
  resolution: "manual_resolution",
) {
  const result = await pool.query<{ id: string }>(
    `WITH changed AS (
       UPDATE store_orders
       SET payment_resolution = $2,
           payment_resolved_at = COALESCE(payment_resolved_at, NOW()),
           updated_at = NOW()
       WHERE payment_reference = $1
         AND payment_status = 'cancelled'
         AND payment_resolution = 'refund_pending'
       RETURNING id
     )
     , queued AS (
       INSERT INTO store_order_email_notifications (order_id, notification_type)
       SELECT id, $2 FROM changed
       ON CONFLICT (order_id, notification_type) DO NOTHING
     )
     SELECT id FROM changed`,
    [paymentReference, resolution],
  );
  if (!result.rows[0]) return null;
  return getOrderById(result.rows[0].id);
}

export async function getOrderById(orderId: string) {
  const client = await pool.connect();
  try {
    return loadOrder(client, "id", orderId);
  } finally {
    client.release();
  }
}

export async function claimPaymentRefund(orderId: string) {
  const result = await pool.query<{ id: string; refund_attempt: number; refund_idempotency_key: string }>(
    `WITH changed AS (
       UPDATE store_orders
       SET payment_resolution = 'refund_processing',
           refund_attempt = refund_attempt + 1,
           refund_idempotency_key = 'glam-too-order-refund-' || id || '-' || (refund_attempt + 1)::text,
           updated_at = NOW()
       WHERE id = $1
         AND payment_status = 'cancelled'
         AND payment_resolution = 'refund_pending'
       RETURNING id, refund_attempt, refund_idempotency_key
     )
     , queued AS (
       INSERT INTO store_order_email_notifications (order_id, notification_type)
       SELECT id, 'refund_processing' FROM changed
       ON CONFLICT (order_id, notification_type) DO NOTHING
     )
     SELECT id, refund_attempt, refund_idempotency_key FROM changed`,
    [orderId],
  );
  const claimed = result.rows[0];
  if (!claimed) return null;
  return { attempt: claimed.refund_attempt, idempotencyKey: claimed.refund_idempotency_key };
}

export async function getRefundProcessingAttempt(orderId: string) {
  const result = await pool.query<{ idempotency_key: string }>(
    `SELECT refund_idempotency_key AS idempotency_key
     FROM store_orders
     WHERE id = $1
       AND payment_status = 'cancelled'
       AND payment_resolution = 'refund_processing'
       AND refund_idempotency_key IS NOT NULL
     LIMIT 1`,
    [orderId],
  );
  return result.rows[0]?.idempotency_key ?? null;
}

export async function recordStripeRefundStatus(
  orderId: string,
  refundId: string | null,
  status: "succeeded" | "pending" | "failed",
) {
  const resolution = status === "succeeded"
    ? "refunded"
    : status === "failed"
      ? "refund_pending"
      : "refund_processing";
  const result = await pool.query<{ id: string }>(
    `WITH changed AS (
       UPDATE store_orders
       SET payment_resolution = $2,
           stripe_refund_id = COALESCE($3, stripe_refund_id),
           refund_idempotency_key = CASE WHEN $2 = 'refund_pending' THEN NULL ELSE refund_idempotency_key END,
           payment_resolved_at = CASE WHEN $2 = 'refunded' THEN COALESCE(payment_resolved_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
         AND payment_status = 'cancelled'
         AND payment_resolution = 'refund_processing'
       RETURNING id
     )
     , queued AS (
       INSERT INTO store_order_email_notifications (order_id, notification_type)
       SELECT id, 'refunded' FROM changed
       WHERE $2 = 'refunded'
       ON CONFLICT (order_id, notification_type) DO NOTHING
     )
     SELECT id FROM changed`,
    [orderId, resolution, refundId],
  );
  if (!result.rows[0]) return null;
  return getOrderById(orderId);
}

export async function recordStripeRefundWebhook(
  refundId: string,
  status: "succeeded" | "failed",
  orderId?: string,
) {
  const result = await pool.query<{ id: string }>(
    `WITH changed AS (
       UPDATE store_orders
       SET payment_resolution = $2,
           stripe_refund_id = $1,
           refund_idempotency_key = CASE WHEN $2 = 'refund_pending' THEN NULL ELSE refund_idempotency_key END,
           payment_resolved_at = CASE WHEN $2 = 'refunded' THEN COALESCE(payment_resolved_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE (stripe_refund_id = $1 OR ($3::text IS NOT NULL AND id = $3))
         AND payment_status = 'cancelled'
         AND payment_resolution = 'refund_processing'
       RETURNING id
     )
     , queued AS (
       INSERT INTO store_order_email_notifications (order_id, notification_type)
       SELECT id, 'refunded' FROM changed
       WHERE $2 = 'refunded'
       ON CONFLICT (order_id, notification_type) DO NOTHING
     )
     SELECT id FROM changed`,
    [refundId, status === "succeeded" ? "refunded" : "refund_pending", orderId ?? null],
  );
  if (!result.rows[0]) return null;
  return getOrderById(result.rows[0].id);
}

export async function getOrderIdByPaymentReference(paymentReference: string) {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM store_orders WHERE payment_reference = $1 LIMIT 1",
    [paymentReference],
  );
  return result.rows[0]?.id ?? null;
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

import { pool, type PoolClient } from "@workspace/db";

// Order snapshots use the parent catalogue product ID for every variation.
// Payment is authoritative: a Delivered flag never makes an unpaid order valid.
// Resolve by authenticated Clerk ID only, never by email, name, or guest cookie.
export function qualifyingReviewPurchase(reviewAlias: string) {
  // Alias is an internal constant, never input from a request.
  return `${reviewAlias}.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM store_orders o
    JOIN store_order_items oi ON oi.order_id=o.id
    WHERE o.user_id=${reviewAlias}.user_id
      AND oi.product_id=${reviewAlias}.product_id::text
      AND oi.quantity > 0 AND o.payment_status='paid'
      AND o.cancelled_at IS NULL AND o.payment_resolution='none'
  )`;
}

export async function hasQualifyingReviewPurchase(userId: string, productId: number, client?: PoolClient) {
  const result = await (client ?? pool).query(`
    SELECT o.id FROM store_orders o
    JOIN store_order_items oi ON oi.order_id=o.id
    WHERE o.user_id=$1 AND oi.product_id=$2
      AND oi.quantity > 0 AND o.payment_status='paid'
      AND o.cancelled_at IS NULL AND o.payment_resolution='none'
    ORDER BY o.id LIMIT 1 ${client ? "FOR SHARE OF o" : ""}
  `, [userId, String(productId)]);
  return result.rowCount === 1;
}

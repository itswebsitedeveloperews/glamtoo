import { pool } from "@workspace/db";
import { getOrderEmailRuntimeStatus } from "./orderConfirmationNotifications";
import { projectOrderEmailStatus, type EmailStatusOrder, type OrderEmailRecord } from "./orderEmailStatusProjection";

export async function getOrderEmailStatus(reference: string) {
  // Admin OrderPayload exposes payment_reference, not the private database id.
  const result = await pool.query<EmailStatusOrder>(
    "SELECT id, email, payment_status, payment_resolution FROM store_orders WHERE id=$1 OR payment_reference=$1 LIMIT 1",
    [reference],
  );
  const order = result.rows[0];
  if (!order) return null;
  const [records, runtime] = await Promise.all([
    pool.query<OrderEmailRecord>(
      `SELECT id, notification_type, recipient_email, status, attempts, provider, provider_message_id,
        created_at, updated_at, next_attempt_at, sent_at, accepted_at, delivered_at, last_error,
        retry_safe, manual_retry_count, bounced_at, provider_email_id, customer_retry_approved_at
       FROM store_order_email_notifications
       WHERE order_id=$1 AND (notification_type='order_confirmation' OR notification_type LIKE 'admin_order_confirmation:%')
       ORDER BY created_at, id`, [order.id],
    ),
    getOrderEmailRuntimeStatus(order.email),
  ]);
  return projectOrderEmailStatus(order, records.rows, runtime);
}

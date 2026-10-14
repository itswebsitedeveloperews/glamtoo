import { pool } from "@workspace/db";
import { getOrderEmailRuntimeStatus } from "./orderConfirmationNotifications";
import { customerEmailRetryEligibility } from "./customerEmailRetryEligibility";
import type { EmailStatusOrder, OrderEmailRecord } from "./orderEmailStatusProjection";

export class CustomerEmailRetryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Approval only: no SMTP, provider retry, attempt reset or historical backfill. */
export async function approveCustomerEmailRetry(reference: string, actor: string) {
  const initial = await pool.query<EmailStatusOrder>(
    "SELECT id, email, payment_status, payment_resolution FROM store_orders WHERE id=$1 OR payment_reference=$1 LIMIT 1",
    [reference],
  );
  if (!initial.rows[0]) throw new CustomerEmailRetryError(404, "Order not found.");
  // Resolve configuration before taking locks: concurrent approvals must not
  // exhaust the pool while holding connections and awaiting more connections.
  const runtime = await getOrderEmailRuntimeStatus(initial.rows[0].email);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query<EmailStatusOrder>(
      "SELECT id, email, payment_status, payment_resolution FROM store_orders WHERE id=$1 FOR UPDATE",
      [initial.rows[0].id],
    );
    const order = saved.rows[0];
    if (!order) throw new CustomerEmailRetryError(404, "Order not found.");
    if (order.email !== initial.rows[0].email) throw new CustomerEmailRetryError(409, "Order details changed. Refresh before approving.");
    const queued = await client.query<OrderEmailRecord>(
      "SELECT * FROM store_order_email_notifications WHERE order_id=$1 AND notification_type='order_confirmation' FOR UPDATE",
      [order.id],
    );
    const record = queued.rows[0];
    let outcome: "approved" | "already_approved" | "already_processed";
    let message: string;
    if (record && ["accepted", "delivered"].includes(record.status)) {
      outcome = "already_processed"; message = "This customer confirmation was already processed. No additional email was queued.";
    } else if (record?.customer_retry_approved_at && record.status === "pending" && record.attempts === 0
      && !record.provider_message_id && !record.sent_at && !record.accepted_at && !record.delivered_at) {
      outcome = "already_approved"; message = "This customer confirmation is already approved. No additional email was queued.";
    } else {
      const eligibility = customerEmailRetryEligibility(order, record, runtime);
      if (!eligibility.eligible) throw new CustomerEmailRetryError(409, eligibility.reason);
      await client.query(
        `UPDATE store_order_email_notifications SET customer_retry_approved_at=NOW(),
         customer_retry_approved_by=$2, next_attempt_at=NOW(), updated_at=NOW()
         WHERE id=$1`, [record!.id, actor],
      );
      outcome = "approved"; message = "Only this customer confirmation was approved for the saved order email. Sending will be handled by the email worker.";
    }
    await client.query("COMMIT");
    return { outcome, message };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

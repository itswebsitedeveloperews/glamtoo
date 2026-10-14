import { pool } from "@workspace/db";
import { adminOrderNotificationType } from "./adminOrderNotifications";
import { getOrderEmailRuntimeStatus } from "./orderConfirmationNotifications";
import { approvedAdminRecipients, missingAdminCopyBlock, retryBlock } from "./orderEmailActionsPolicy";
import type { EmailStatusOrder, OrderEmailRecord } from "./orderEmailStatusProjection";
import { configuredAdminEmails } from "./adminAuth";

export class OrderEmailActionError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export type OrderEmailAction = {
  confirmed: boolean; recipients: string[]; action: "admin_copy" | "retry"; notificationId?: number;
};

// Queue only: never contact SMTP in the request. The normal worker retains all
// recipient, payment and ambiguity checks. The order lock serialises all actions.
export async function requestOrderEmailAction(reference: string, input: OrderEmailAction, actor: string) {
  if (input.confirmed !== true) throw new OrderEmailActionError(400, "Explicit confirmation is required.");
  const initial = (await pool.query<EmailStatusOrder>(
    "SELECT id, email, payment_status, payment_resolution FROM store_orders WHERE id=$1 OR payment_reference=$1 LIMIT 1", [reference],
  )).rows[0];
  if (!initial) throw new OrderEmailActionError(404, "Order not found.");
  // Configuration reads use the pool. Finish them before holding a transaction
  // connection, so concurrent approvals cannot exhaust the pool waiting on itself.
  const runtime = await getOrderEmailRuntimeStatus(initial.email);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = (await client.query<EmailStatusOrder>(
      "SELECT id, email, payment_status, payment_resolution FROM store_orders WHERE id=$1 OR payment_reference=$1 LIMIT 1 FOR UPDATE NOWAIT", [reference],
    )).rows[0];
    if (!order) throw new OrderEmailActionError(404, "Order not found.");
    if (order.id !== initial.id || order.email !== initial.email) throw new OrderEmailActionError(409, "Order changed. Refresh before approving.");
    // Settings edits cannot change the approval snapshot during this transaction.
    const settings = (await client.query<{ order_enabled: boolean; order_admin_emails: string[]; fallback_admin_email: string }>(
      "SELECT order_enabled, order_admin_emails, fallback_admin_email FROM store_contact_notification_settings WHERE id=1 FOR SHARE",
    )).rows[0];
    const fallback = settings?.fallback_admin_email || [...configuredAdminEmails()][0];
    runtime.adminEnabled = Boolean(settings?.order_enabled);
    runtime.adminRecipients = settings?.order_admin_emails.length ? settings.order_admin_emails : fallback ? [fallback] : [];
    const records = (await client.query<OrderEmailRecord>(
      "SELECT * FROM store_order_email_notifications WHERE order_id=$1 FOR UPDATE NOWAIT", [order.id],
    )).rows;
    const row = input.action === "retry" ? records.find(n => n.id === input.notificationId) : undefined;
    const block = input.action === "admin_copy" ? missingAdminCopyBlock(order, records, runtime)
      : row ? retryBlock(order, row, runtime) : "Notification not found for this order.";
    if (block) throw new OrderEmailActionError(409, block);
    const recipients = input.action === "admin_copy" ? approvedAdminRecipients(runtime)
      : [row!.notification_type === "order_confirmation" ? order.email : row!.recipient_email!];
    // Exact snapshot, not a caller-chosen address. No subset or newly added
    // recipients can slip through an approval made against older settings.
    if (JSON.stringify(input.recipients) !== JSON.stringify(recipients)) {
      throw new OrderEmailActionError(409, "Recipients changed. Refresh and approve the current recipient snapshot.");
    }
    if (input.action === "admin_copy") {
      for (const email of recipients) {
        await client.query(
          `INSERT INTO store_order_email_notifications
           (order_id, notification_type, recipient_email, provider, manual_requested_by, manual_requested_at)
           VALUES ($1,$2,$3,'gmail_smtp',$4,NOW())`,
          [order.id, adminOrderNotificationType(email), email, actor],
        );
      }
    } else {
      const updated = await client.query(
        `UPDATE store_order_email_notifications SET status='pending', retry_safe=0,
         manual_retry_count=manual_retry_count+1, manual_requested_by=$2, manual_requested_at=NOW(),
         next_attempt_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND status='failed' AND retry_safe=1 AND manual_retry_count=0
           AND accepted_at IS NULL AND delivered_at IS NULL AND sent_at IS NULL
         RETURNING id`, [row!.id, actor],
      );
      if (!updated.rowCount) throw new OrderEmailActionError(409, "This notification can no longer be retried.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && ["55P03", "23505"].includes(String(error.code))) {
      throw new OrderEmailActionError(409, "Another request has already queued or changed this email. Refresh its status.");
    }
    throw error;
  } finally { client.release(); }
}

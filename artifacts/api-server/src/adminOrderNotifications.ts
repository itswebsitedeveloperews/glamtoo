import { createHash } from "node:crypto";
import { type PoolClient } from "@workspace/db";
import { configuredAdminEmails } from "./adminAuth";

// Only called for a newly finalized paid order, within its existing transaction.
// Saving settings and worker startup never backfill historical orders.
export async function enqueueAdminOrderConfirmations(client: PoolClient, orderId: string) {
  const result = await client.query<{ order_enabled: boolean; order_admin_emails: string[]; fallback_admin_email: string }>(
    "SELECT order_enabled, order_admin_emails, fallback_admin_email FROM store_contact_notification_settings WHERE id = 1");
  const settings = result.rows[0];
  if (!settings?.order_enabled) return;
  const fallback = settings.fallback_admin_email || [...configuredAdminEmails()][0];
  const recipients = settings.order_admin_emails.length ? settings.order_admin_emails : fallback ? [fallback] : [];
  for (const email of new Set(recipients.map(value => value.trim().toLowerCase()))) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const type = `admin_order_confirmation:${createHash("sha256").update(email).digest("hex")}`;
    await client.query(
      `INSERT INTO store_order_email_notifications (order_id, notification_type, recipient_email)
       VALUES ($1, $2, $3) ON CONFLICT (order_id, notification_type) DO NOTHING`, [orderId, type, email]);
  }
}

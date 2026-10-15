import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { emailRecipientPolicy } from "./emailRecipientPolicy";
import { EMAIL_BRAND } from "./emailBranding";
import { buildRefundNotificationMessage, type RefundNotificationType } from "./refundNotificationTemplate";
export { buildRefundNotificationMessage, type RefundNotificationType } from "./refundNotificationTemplate";

type RefundNotificationRow = {
  id: number;
  order_id: string;
  notification_type: RefundNotificationType;
  email: string;
  customer_name: string;
};

export function isRefundEmailDeliveryConfigured() {
  return Boolean(mailerSendConfig());
}

function mailerSendConfig() {
  const token = process.env.MAILERSEND_API_TOKEN?.trim();
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL?.trim();
  const fromName = process.env.MAILERSEND_FROM_NAME?.trim() || EMAIL_BRAND.name;
  const policy = emailRecipientPolicy();
  return token && fromEmail && policy ? { token, fromEmail, fromName, ...policy } : null;
}

async function sendWithMailerSend(
  row: RefundNotificationRow,
  message: ReturnType<typeof buildRefundNotificationMessage>,
) {
  const config = mailerSendConfig();
  if (!config) {
    throw new Error("MailerSend is not configured; refund email remains queued.");
  }

  const response = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: config.fromEmail, name: config.fromName },
      to: [{ email: row.email, name: row.customer_name || undefined }],
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        disposition: attachment.contentDisposition,
        id: attachment.cid,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`MailerSend rejected the refund email with status ${response.status}.`);
  }
}

async function claimNextNotification(config: NonNullable<ReturnType<typeof mailerSendConfig>>) {
  const result = await pool.query<RefundNotificationRow>(
    `WITH candidate AS (
       SELECT n.id
       FROM store_order_email_notifications n
       JOIN store_orders o ON o.id = n.order_id
       WHERE n.notification_type IN ('refund_processing', 'refunded', 'manual_resolution')
         AND (n.status = 'pending'
           OR (n.status = 'sending' AND n.updated_at < NOW() - INTERVAL '15 minutes'))
         AND ($1::boolean OR LOWER(o.email) = ANY($2::text[]))
       ORDER BY n.created_at, n.id
       FOR UPDATE OF n SKIP LOCKED
       LIMIT 1
     )
     UPDATE store_order_email_notifications AS notifications
     SET status = 'sending',
         attempts = notifications.attempts + 1,
         updated_at = NOW()
     FROM candidate, store_orders AS orders
     WHERE notifications.id = candidate.id
       AND orders.id = notifications.order_id
     RETURNING notifications.id, notifications.order_id, notifications.notification_type,
       orders.email, orders.customer_name`,
    [config.allCustomers, config.recipients],
  );
  return result.rows[0] ?? null;
}

async function markSent(id: number) {
  await pool.query(
    `UPDATE store_order_email_notifications
     SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), last_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'sending'`,
    [id],
  );
}

async function markRetryable(id: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown email delivery error";
  await pool.query(
    `UPDATE store_order_email_notifications
     SET status = 'pending', last_error = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'sending'`,
    [id, message.slice(0, 500)],
  );
}

export async function processRefundNotifications(limit = 10) {
  const config = mailerSendConfig();
  if (!config) return;
  for (let index = 0; index < limit; index += 1) {
    const notification = await claimNextNotification(config);
    if (!notification) return;
    try {
      await sendWithMailerSend(
        notification,
        buildRefundNotificationMessage(
          notification.notification_type,
          notification.order_id,
          notification.customer_name,
        ),
      );
      await markSent(notification.id);
    } catch (error) {
      await markRetryable(notification.id, error);
      logger.error(
        { error, notificationId: notification.id, orderId: notification.order_id },
        "Refund email delivery failed; it will be retried",
      );
    }
  }
}

export function startRefundNotificationWorker() {
  const process = async () => {
    try {
      await processRefundNotifications();
    } catch (error) {
      logger.error({ error }, "Refund email worker failed");
    }
  };
  void process();
  setInterval(() => { void process(); }, 30 * 1000).unref();
}
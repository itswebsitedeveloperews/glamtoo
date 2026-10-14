import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { buildOrderConfirmation, type ConfirmationItem, type ConfirmationOrder } from "./orderConfirmationTemplate";
import { orderConfirmationRecipientPolicy } from "./emailRecipientPolicy";
import { getContactNotificationSettings } from "./contactNotifications";
import { gmailOrderMessageId, gmailAdminOrderMessageId, gmailSmtpConfiguration, GmailSmtpError, sendGmailConfirmation, sendGmailAdminOrderConfirmation } from "./gmailSmtp";

const MAX_ATTEMPTS = 5;
type Notification = {
  id: number;
  order_id: string;
  attempts: number;
  provider_message_id: string | null;
  provider_email_id: string | null;
  recipient_email: string | null;
  notification_type: string;
};
type EmailMessage = ReturnType<typeof buildOrderConfirmation>;

async function configuration(transport = process.env.ORDER_EMAIL_TRANSPORT === "mailersend" ? "mailersend" : "gmail_smtp", adminAudience = false) {
  const token = process.env.MAILERSEND_API_TOKEN?.trim();
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL?.trim();
  const smtp = transport === "gmail_smtp" ? await gmailSmtpConfiguration() : null;
  const publicUrl = process.env.ORDER_EMAIL_PUBLIC_URL?.trim();
  const settings = adminAudience ? await getContactNotificationSettings() : null;
  const adminRecipients = settings?.orderAdminEmails.length ? settings.orderAdminEmails
    : settings?.fallbackAdminEmail ? [settings.fallbackAdminEmail] : [];
  const policy = adminAudience ? settings?.orderEnabled && adminRecipients.length
    ? { recipients: adminRecipients, allCustomers: false, allCustomersSince: null as Date | null } : null : orderConfirmationRecipientPolicy();
  // Sending to arbitrary customers is an explicit rollout decision, not an
  // accidental consequence of adding credentials to a staging environment.
  if (!publicUrl || !policy) return null;
  if (transport === "gmail_smtp" ? !smtp : !token || !fromEmail) return null;
  try {
    const url = new URL(publicUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch { return null; }
  return {
    token: token ?? "", fromEmail: fromEmail ?? "", publicUrl, ...policy, transport, smtp,
    adminAudience, fromName: process.env.MAILERSEND_FROM_NAME?.trim() || "Glam Too Boutique",
    replyTo: process.env.MAILERSEND_REPLY_TO_EMAIL?.trim() || fromEmail,
  };
}

export async function isOrderEmailConfigured() { return Boolean(await configuration()); }

// Read-only projection. Never return provider credentials or the customer
// allowlist to an API caller, and never verify SMTP as a side effect of viewing.
export async function getOrderEmailRuntimeStatus(customerEmail: string) {
  const [customer, admin, settings] = await Promise.all([
    configuration(), configuration("gmail_smtp", true), getContactNotificationSettings(),
  ]);
  const policy = orderConfirmationRecipientPolicy();
  const previouslyApproved = Boolean(policy?.recipients.includes(customerEmail.trim().toLowerCase()));
  return {
    transport: process.env.ORDER_EMAIL_TRANSPORT === "mailersend" ? "mailersend" : "gmail_smtp",
    customerConfigured: Boolean(customer),
    customerRecipientAllowed: Boolean(policy && (policy.allCustomers || policy.recipients.includes(customerEmail.trim().toLowerCase()))),
    customerEnabledSince: previouslyApproved ? null : policy?.allCustomersSince ?? null,
    customerAuthorizedSince: customer?.smtp?.authorizedSince ?? null,
    adminConfigured: Boolean(admin),
    adminEnabled: settings.orderEnabled,
    adminRecipients: (settings.orderAdminEmails.length ? settings.orderAdminEmails : settings.fallbackAdminEmail ? [settings.fallbackAdminEmail] : [])
      .map(email => email.trim().toLowerCase()),
  };
}

class DeliveryError extends Error {
  constructor(public readonly kind: "retry" | "failed" | "uncertain", message: string) { super(message); }
}

async function send(config: NonNullable<Awaited<ReturnType<typeof configuration>>>, order: ConfirmationOrder, message: EmailMessage, savedMessageId?: string | null) {
  if (config.transport === "gmail_smtp") {
    return sendGmailConfirmation(config.smtp!, order, message, savedMessageId);
  }
  let response: Response;
  try {
    response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: config.fromEmail, name: config.fromName },
        reply_to: { email: config.replyTo, name: config.fromName },
        to: [{ email: order.email }],
        tags: ["glam-too-order-confirmation", `glam-too-${order.id}`],
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments.map((attachment) => ({
          content: attachment.content.toString("base64"),
          filename: attachment.filename,
          disposition: attachment.contentDisposition,
          id: attachment.cid,
        })),
      }),
    });
  } catch {
    // MailerSend does not document an idempotent-send key. A timeout might
    // follow acceptance: never blindly resend an ambiguous request.
    throw new DeliveryError("uncertain", "Provider response unavailable; reconcile the order tag in MailerSend before resending.");
  }
  const messageId = response.headers.get("x-message-id");
  if (response.ok && messageId) return messageId;
  if (response.ok) {
    // 202 ALL_SUPPRESSED has no message id and is not a sent email.
    throw new DeliveryError("failed", "Provider accepted no message; check suppression and sender configuration.");
  }
  if (response.status === 429 || response.status === 503) {
    throw new DeliveryError("retry", `Provider rejected the request temporarily (HTTP ${response.status}).`);
  }
  if (response.status >= 500) {
    throw new DeliveryError("uncertain", `Provider outcome is uncertain (HTTP ${response.status}); reconcile before resending.`);
  }
  throw new DeliveryError("failed", `Provider rejected the request (HTTP ${response.status}); check credentials, sender and recipient restrictions.`);
}

async function claim(config: NonNullable<Awaited<ReturnType<typeof configuration>>>) {
  const result = await pool.query<Notification>(
    `WITH candidate AS (
       SELECT n.id FROM store_order_email_notifications n
       JOIN store_orders o ON o.id = n.order_id
       WHERE n.status = 'pending'
         AND n.next_attempt_at <= NOW() AND n.attempts < $1 + n.manual_retry_count
         AND o.payment_status = 'paid' AND o.payment_resolution = 'none'
         AND (
           ($6::boolean AND n.notification_type LIKE 'admin_order_confirmation:%' AND LOWER(n.recipient_email) = ANY($3::text[]))
           OR (NOT $6::boolean AND n.notification_type = 'order_confirmation'
             AND (($2::boolean AND ($7::timestamptz IS NULL OR n.created_at >= $7 OR n.customer_retry_approved_at IS NOT NULL OR n.manual_retry_count > 0)) OR LOWER(o.email) = ANY($3::text[]))
             AND ($5::timestamptz IS NULL OR n.created_at >= $5 OR n.customer_retry_approved_at IS NOT NULL))
         )
       ORDER BY n.created_at, n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1
     )
     UPDATE store_order_email_notifications n
     SET status = 'sending', attempts = n.attempts + 1, provider = $4, retry_safe = 0, updated_at = NOW()
     FROM candidate WHERE n.id = candidate.id RETURNING n.*`,
    [MAX_ATTEMPTS, config.allCustomers, config.recipients, config.transport, config.smtp?.authorizedSince ?? null, config.adminAudience, config.allCustomersSince],
  );
  return result.rows[0] ?? null;
}

async function sendNotification(notification: Notification, config: NonNullable<Awaited<ReturnType<typeof configuration>>>) {
  const result = await pool.query<ConfirmationOrder & { payment_status: string; payment_resolution: string }>(
    "SELECT * FROM store_orders WHERE id = $1", [notification.order_id],
  );
  const order = result.rows[0];
  if (!order || order.payment_status !== "paid" || order.payment_resolution !== "none") {
    await pool.query(
      `UPDATE store_order_email_notifications SET status = 'failed', failed_at = NOW(),
       last_error = 'Order is no longer eligible for a paid confirmation', updated_at = NOW()
       WHERE id = $1 AND status = 'sending'`, [notification.id],
    );
    return;
  }
  const items = await pool.query<ConfirmationItem>(
    "SELECT name, quantity, unit_amount, total FROM store_order_items WHERE order_id = $1 ORDER BY id",
    [order.id],
  );
  const isAdminCopy = notification.notification_type.startsWith("admin_order_confirmation:");
  if (isAdminCopy && !notification.recipient_email) throw new DeliveryError("failed", "The saved admin recipient is missing.");
  if (config.transport === "gmail_smtp") {
    // Persist the deterministic RFC Message-ID before contacting SMTP, so an
    // interrupted DATA transaction can be reconciled without a blind resend.
    await pool.query(
      "UPDATE store_order_email_notifications SET provider_message_id = $2 WHERE id = $1 AND status = 'sending'",
      [notification.id, notification.provider_message_id || (isAdminCopy
        ? gmailAdminOrderMessageId(config.smtp!, order.id, notification.recipient_email!)
        : gmailOrderMessageId(config.smtp!, order.id))],
    );
  }
  const message = buildOrderConfirmation(order, items.rows, config.publicUrl);
  const messageId = isAdminCopy
    ? await sendGmailAdminOrderConfirmation(config.smtp!, order.id, notification.recipient_email!, message, notification.provider_message_id)
    : await send(config, order, message, notification.provider_message_id);
  // This is provider acceptance, not evidence of inbox delivery.
  await pool.query(
    `UPDATE store_order_email_notifications SET status = 'accepted', provider_message_id = $2,
     accepted_at = NOW(), last_error = NULL, next_attempt_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
     WHERE id = $1 AND status = 'sending'`, [notification.id, messageId],
  );
  logger.info({ notificationId: notification.id, orderId: order.id, transport: config.transport }, "Order email accepted by provider; delivery is not yet confirmed");
}

async function retryOrFail(notification: Notification, error: unknown) {
  const failure = error instanceof DeliveryError || error instanceof GmailSmtpError
    ? error : new DeliveryError("uncertain", "Email processing was interrupted; reconcile before resending.");
  const status = failure.kind === "retry" && notification.attempts < MAX_ATTEMPTS ? "pending"
    : failure.kind === "uncertain" ? "uncertain" : "failed";
  const delay = Math.min(1800, 60 * 2 ** (notification.attempts - 1));
  await pool.query(
    `UPDATE store_order_email_notifications SET status = $2, last_error = $3, retry_safe = $5,
     next_attempt_at = NOW() + make_interval(secs => $4),
     failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END, updated_at = NOW()
     WHERE id = $1 AND status = 'sending'`,
    [notification.id, status, failure.message, delay, failure.kind === "uncertain" ? 0 : 1],
  );
  logger.warn({ notificationId: notification.id, orderId: notification.order_id, status }, "Order email attempt needs attention");
}

async function getProviderData(config: NonNullable<Awaited<ReturnType<typeof configuration>>>, path: string) {
  const response = await fetch(`https://api.mailersend.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Provider delivery lookup failed (HTTP ${response.status}).`);
  return await response.json() as { data?: {
    id?: string; message_id?: string; to?: string; status?: string; suppression_reason?: string;
    emails?: Array<{ id: string }>;
    activity?: Array<{ id: string; type: string; created_at: string }>;
  } };
}

export async function refreshOrderEmailDelivery(limit = 2) {
  // Only previously accepted MailerSend messages can use its delivery API.
  // Gmail SMTP does not expose a delivery webhook or inbox receipt here.
  const config = await configuration("mailersend");
  if (!config) return;
  // Advance the lease atomically: multiple API instances must not hammer the
  // provider. Delivery lookups never cause another send.
  const result = await pool.query<Notification>(
    `WITH candidate AS (
       SELECT id FROM store_order_email_notifications
       WHERE notification_type = 'order_confirmation' AND status = 'accepted' AND provider = 'mailersend'
         AND provider_message_id IS NOT NULL AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE store_order_email_notifications n
     SET next_attempt_at = NOW() + INTERVAL '30 minutes', updated_at = NOW()
     FROM candidate WHERE n.id = candidate.id RETURNING n.*`,
    [Math.min(limit, 10)],
  );
  for (const notification of result.rows) {
    try {
      let emailId = notification.provider_email_id;
      if (!emailId) {
        const message = await getProviderData(config, `messages/${encodeURIComponent(notification.provider_message_id!)}`);
        emailId = message.data?.emails?.[0]?.id ?? null;
      }
      if (!emailId) continue; // Still queued inside MailerSend.
      const email = (await getProviderData(config, `email/${encodeURIComponent(emailId)}`)).data;
      const order = await pool.query<{ email: string }>("SELECT email FROM store_orders WHERE id = $1", [notification.order_id]);
      if (!email || email.message_id !== notification.provider_message_id
        || email.to?.toLowerCase() !== order.rows[0]?.email.toLowerCase()) {
        throw new Error("Provider delivery record did not match this order.");
      }
      const bounced = email.suppression_reason === "hard_bounced"
        || email.activity?.some((event) => event.type === "hard_bounced");
      const status = bounced ? "bounced" : email.status === "delivered" ? "delivered"
        : email.status === "rejected" ? "failed" : "accepted";
      await pool.query(
        `UPDATE store_order_email_notifications SET status = $2, provider_email_id = $3,
         delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
         bounced_at = CASE WHEN $2 = 'bounced' THEN COALESCE(bounced_at, NOW()) ELSE bounced_at END,
         failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
         last_error = CASE WHEN $2 IN ('bounced', 'failed') THEN 'Provider reported bounce or rejection' ELSE NULL END,
         updated_at = NOW() WHERE id = $1 AND status = 'accepted'`,
        [notification.id, status, emailId],
      );
      if (status !== "accepted") logger.info({ notificationId: notification.id, status }, "Order email delivery result recorded");
    } catch {
      // Do not log provider response bodies: they can contain addresses/content.
      await pool.query(
        "UPDATE store_order_email_notifications SET last_error = 'Provider delivery lookup failed; check token read permissions', updated_at = NOW() WHERE id = $1 AND status = 'accepted'",
        [notification.id],
      );
      logger.warn({ notificationId: notification.id }, "Could not verify order email delivery yet");
    }
  }
}

export async function processOrderConfirmations(limit = 10) {
  const configured = await Promise.allSettled([configuration(), configuration("gmail_smtp", true)]);
  const configs = configured.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
  configured.forEach((result, index) => {
    if (result.status === "rejected") logger.warn({ audience: index === 0 ? "customer" : "admin" }, "Order email configuration unavailable; only this channel is paused");
  });
  if (!configs.length) return;
  // A crashed sender may already have been accepted. Freeze these rows rather
  // than resetting them to pending and creating duplicate confirmations.
  await pool.query(
    `UPDATE store_order_email_notifications SET status = 'uncertain',
     last_error = 'Sender lease expired; reconcile the Message-ID or order tag with the recorded provider before resending', updated_at = NOW()
     WHERE (notification_type = 'order_confirmation' OR notification_type LIKE 'admin_order_confirmation:%') AND status = 'sending'
       AND updated_at < NOW() - INTERVAL '15 minutes'`,
  );
  for (const config of configs) for (let index = 0; index < limit; index += 1) {
    const notification = await claim(config);
    if (!notification) break;
    try { await sendNotification(notification, config); }
    catch (error) { await retryOrFail(notification, error); }
  }
}

export function startOrderConfirmationWorker() {
  let running = false;
  const process = async () => {
    if (running) return;
    running = true;
    try {
      await processOrderConfirmations();
      await refreshOrderEmailDelivery();
    } catch {
      logger.error("Order email worker failed; saved payments and inventory are unchanged");
    } finally { running = false; }
  };
  void process();
  setInterval(() => { void process(); }, 30_000).unref();
}

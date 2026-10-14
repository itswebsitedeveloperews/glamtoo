import type { getOrderEmailRuntimeStatus } from "./orderConfirmationNotifications";
import { approvedAdminRecipients, missingAdminCopyBlock, retryBlock } from "./orderEmailActionsPolicy";
import { customerEmailRetryEligibility } from "./customerEmailRetryEligibility";

type DateValue = Date | string | null;
export type EmailStatusOrder = { id: string; email: string; payment_status: string; payment_resolution: string };
export type OrderEmailRecord = {
  id: number; notification_type: string; recipient_email: string | null; status: string;
  attempts: number; provider: string; provider_message_id: string | null;
  created_at: DateValue; updated_at: DateValue; next_attempt_at: DateValue;
  sent_at: DateValue; accepted_at: DateValue; delivered_at: DateValue; last_error: string | null;
  retry_safe?: number; manual_retry_count?: number; bounced_at?: DateValue; provider_email_id?: string | null;
  customer_retry_approved_at?: DateValue;
};
type Runtime = Awaited<ReturnType<typeof getOrderEmailRuntimeStatus>>;
function iso(value: DateValue) {
  return value === null ? null : new Date(value).toISOString();
}

export function projectOrderEmailStatus(order: EmailStatusOrder, records: OrderEmailRecord[], runtime: Runtime) {
  const notifications = records.filter(row =>
    row.notification_type === "order_confirmation" || row.notification_type.startsWith("admin_order_confirmation:")
  ).map(row => {
    const audience = row.notification_type === "order_confirmation" ? "customer" as const : "admin" as const;
    const recipient = audience === "customer" ? order.email : row.recipient_email;
    let blockReason: string | null = null;
    if (row.status === "pending") {
      if (order.payment_status !== "paid" || order.payment_resolution !== "none") {
        blockReason = "Email is paused because payment is not confirmed or requires a refund/resolution.";
      } else if (audience === "customer") {
        if (!runtime.customerRecipientAllowed) blockReason = "The shop is in test-recipient mode. Automatic customer confirmations are not enabled for this address. This is a shop sending restriction; the customer does not need to approve anything.";
        else if (!runtime.customerConfigured) blockReason = "Order email sending is not fully configured or Gmail is not authorised. Check Gmail authentication and email settings in Payments.";
        else if (!row.customer_retry_approved_at && !(row.manual_retry_count && row.manual_retry_count > 0)
          && runtime.customerEnabledSince && row.created_at && new Date(row.created_at) < runtime.customerEnabledSince) {
          blockReason = "This confirmation was queued before automatic customer emails were enabled. Older queued emails are not sent automatically.";
        }
        else if (!row.customer_retry_approved_at && runtime.customerAuthorizedSince && row.created_at && new Date(row.created_at) < runtime.customerAuthorizedSince) {
          blockReason = "This email was queued before the current Gmail authorisation. Historical emails are not sent automatically.";
        }
      } else {
        if (!runtime.adminEnabled) blockReason = "Admin order-copy emails are currently disabled in Payments settings.";
        else if (!recipient || !runtime.adminRecipients.includes(recipient.toLowerCase())) blockReason = "This saved admin recipient is not currently enabled in Payments settings. The original recipient has not been changed.";
        else if (!runtime.adminConfigured) blockReason = "Admin email sending is not fully configured or Gmail is not authorised. Check authentication in Payments.";
      }
      if (!blockReason && row.attempts >= 5 + (row.manual_retry_count ?? 0)) blockReason = "The maximum number of sending attempts has been reached.";
    }
    return {
      id: row.id, audience, recipient, status: row.status, blockReason,
      attempts: row.attempts, maxAttempts: 5 + (row.manual_retry_count ?? 0),
      retryBlockReason: retryBlock(order, row, runtime),
      provider: row.attempts > 0 ? row.provider : audience === "admin" ? "gmail_smtp" : runtime.transport,
      messageId: row.provider_message_id,
      queuedAt: iso(row.created_at), lastUpdatedAt: iso(row.updated_at),
      nextAttemptAt: iso(row.next_attempt_at), sentAt: iso(row.sent_at),
      acceptedAt: iso(row.accepted_at), deliveredAt: iso(row.delivered_at),
      lastError: row.last_error,
    };
  });
  return {
    orderId: order.id, notifications,
    customerRetry: customerEmailRetryEligibility(order, records.find(row => row.notification_type === "order_confirmation"), runtime),
    adminCopyAction: { recipients: approvedAdminRecipients(runtime), blockReason: missingAdminCopyBlock(order, records, runtime) },
    notQueued: {
      customer: notifications.some(row => row.audience === "customer") ? null
        : "No customer confirmation was queued for this order. Older orders are not emailed automatically.",
      admin: notifications.some(row => row.audience === "admin") ? null
        : "No admin copy was queued for this order. Admin copies must be enabled when payment is finalised; saving settings later does not resend older orders.",
    },
  };
}

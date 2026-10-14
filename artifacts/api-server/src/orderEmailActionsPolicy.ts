import type { EmailStatusOrder, OrderEmailRecord } from "./orderEmailStatusProjection";
import type { getOrderEmailRuntimeStatus } from "./orderConfirmationNotifications";

type Runtime = Awaited<ReturnType<typeof getOrderEmailRuntimeStatus>>;
export function approvedAdminRecipients(runtime: Runtime) {
  return [...new Set(runtime.adminRecipients.map(email => email.trim().toLowerCase()))]
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).sort();
}

export function missingAdminCopyBlock(order: EmailStatusOrder, records: OrderEmailRecord[], runtime: Runtime) {
  if (order.payment_status !== "paid" || order.payment_resolution !== "none") return "Payment must be paid with no refund or unresolved payment.";
  if (records.some(row => row.notification_type.startsWith("admin_order_confirmation:"))) return "An admin copy is already recorded. No additional copies can be created.";
  if (!runtime.adminEnabled) return "Admin order copies are disabled in Payments settings.";
  if (!runtime.adminConfigured || !approvedAdminRecipients(runtime).length) return "Configure Gmail and approved admin recipients in Payments first.";
  return null;
}

export function retryBlock(order: EmailStatusOrder, row: OrderEmailRecord, runtime: Runtime) {
  if (order.payment_status !== "paid" || order.payment_resolution !== "none") return "Payment must be paid with no refund or unresolved payment.";
  if (!["order_confirmation"].includes(row.notification_type) && !row.notification_type.startsWith("admin_order_confirmation:")) return "This notification cannot be retried here.";
  if (row.status !== "failed" || row.retry_safe !== 1 || row.sent_at || row.accepted_at || row.delivered_at || row.bounced_at || row.provider_email_id) {
    return "Only definitive pre-acceptance failures can be retried. Accepted, delivered or uncertain messages cannot be resent.";
  }
  if ((row.manual_retry_count ?? 0) > 0) return "The one-time manual retry has already been used.";
  if (row.notification_type === "order_confirmation") {
    if (!runtime.customerRecipientAllowed || !runtime.customerConfigured) return "Customer sending is restricted or not configured.";
    if (row.provider !== runtime.transport) return "The original email provider is no longer selected.";
    if (runtime.customerAuthorizedSince && row.created_at && new Date(row.created_at) < runtime.customerAuthorizedSince) return "This customer message predates the current Gmail authorisation.";
  } else {
    if (row.provider !== "gmail_smtp" || !runtime.adminEnabled || !runtime.adminConfigured
      || !row.recipient_email || !approvedAdminRecipients(runtime).includes(row.recipient_email.toLowerCase())) {
      return "The original admin recipient must still be enabled and Gmail configured.";
    }
  }
  return null;
}

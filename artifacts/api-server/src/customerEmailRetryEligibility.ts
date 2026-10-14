import type { EmailStatusOrder, OrderEmailRecord } from "./orderEmailStatusProjection";

export function customerEmailRetryEligibility(
  order: EmailStatusOrder,
  record: OrderEmailRecord | undefined,
  runtime: { customerConfigured: boolean; customerRecipientAllowed: boolean },
) {
  const result = (eligible: boolean, reason: string) => ({ eligible, reason, recipient: order.email });
  if (order.payment_status !== "paid" || order.payment_resolution !== "none") {
    return result(false, "A confirmed paid order without a payment resolution is required.");
  }
  if (!record) return result(false, "No queued customer confirmation exists for this order.");
  if (record.status === "accepted" || record.status === "delivered") {
    return result(false, "This confirmation has already been accepted or delivered. It will not be resent.");
  }
  if (record.status !== "pending" || record.attempts !== 0 || record.provider_message_id
    || record.sent_at || record.accepted_at || record.delivered_at) {
    return result(false, "A previous sending attempt must be reconciled before any resend. This control only releases emails with zero attempts.");
  }
  if (record.customer_retry_approved_at) return result(false, "This confirmation is already approved. The worker will handle it once.");
  if (!runtime.customerRecipientAllowed) return result(false, "The current staging recipient policy does not allow this saved order email.");
  if (!runtime.customerConfigured) return result(false, "Customer email sending or Gmail authorization is not configured.");
  return result(true, "Approve only this unsent confirmation to the email saved on the paid order. No other order or admin copy is retried.");
}

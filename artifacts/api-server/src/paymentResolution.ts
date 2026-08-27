import Stripe from "stripe";
import {
  claimPaymentRefund,
  getOrderById,
  getRefundProcessingAttempt,
  recordPaymentResolution,
  recordStripeRefundStatus,
  type StoredOrder,
} from "./orderService";

function paymentIntentId(payment: Stripe.PaymentIntent | Stripe.Checkout.Session, isPaymentIntent: boolean) {
  if (isPaymentIntent) return payment.id;
  const paymentIntent = (payment as Stripe.Checkout.Session).payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
}

function refundState(refund: Stripe.Refund) {
  return refund.status === "succeeded"
    ? "succeeded"
    : refund.status === "failed" || refund.status === "canceled"
      ? "failed"
      : "pending" as const;
}

/**
 * A database claim makes refund, manual-resolution, browser, and webhook
 * actions mutually exclusive. Capacity is never revisited after cancellation.
 */
export async function attemptPaymentRefund(
  stripe: Stripe,
  orderId: string,
  order: StoredOrder,
  payment: Stripe.PaymentIntent | Stripe.Checkout.Session,
  isPaymentIntent: boolean,
) {
  if (order.paymentResolution !== "refund_pending" && order.paymentResolution !== "refund_processing") return order;

  const intentId = paymentIntentId(payment, isPaymentIntent);
  if (!intentId && order.paymentResolution === "refund_pending") {
    return await recordPaymentResolution(orderId, "manual_resolution")
      ?? await getOrderById(orderId);
  }

  if (!intentId) return await getOrderById(orderId);
  if (order.paymentResolution === "refund_processing") {
    try {
      const existing = await stripe.refunds.list({ payment_intent: intentId, limit: 100 });
      const refund = existing.data.find((candidate) =>
        candidate.metadata?.store === "Glam Too" && candidate.metadata.glam_too_order_id === orderId,
      );
      if (refund) {
        return await recordStripeRefundStatus(orderId, refund.id, refundState(refund))
          ?? await getOrderById(orderId);
      }
    } catch {
      // Do not create a new refund if Stripe cannot confirm whether the
      // original request was accepted.
      return await getOrderById(orderId);
    }
  }
  const idempotencyKey = order.paymentResolution === "refund_pending"
    ? (await claimPaymentRefund(orderId))?.idempotencyKey
    : await getRefundProcessingAttempt(orderId);
  if (!idempotencyKey) return await getOrderById(orderId);

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: intentId, metadata: { store: "Glam Too", glam_too_order_id: orderId } },
      { idempotencyKey },
    );
    return await recordStripeRefundStatus(orderId, refund.id, refundState(refund))
      ?? await getOrderById(orderId);
  } catch {
    // The provider may have accepted the request before its response was lost.
    // Keep the claim so a later retry replays this exact idempotency key.
    return await getOrderById(orderId);
  }
}
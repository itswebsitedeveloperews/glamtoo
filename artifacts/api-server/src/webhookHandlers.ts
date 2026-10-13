import Stripe from "stripe";
import { recordCouponRedemption, releaseCouponReservation } from "./couponService";
import { commitInventoryReservation, releaseInventoryReservation } from "./inventoryService";
import { cancelPendingOrder, finalizePaidOrder, recordStripeRefundWebhook } from "./orderService";
import { attemptPaymentRefund } from "./paymentResolution";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be provided as a Buffer.");
    }

    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
    await WebhookHandlers.reconcileRefund(event);
    await WebhookHandlers.recordCouponRedemption(event);
  }

  private static async reconcileRefund(event: Stripe.Event) {
    if (event.type !== "refund.updated" && event.type !== "refund.failed") return;
    const refund = event.data.object as Stripe.Refund;
    const orderId = refund.metadata?.store === "Glam Too"
      ? refund.metadata.glam_too_order_id
      : undefined;
    if (refund.status === "succeeded") {
      await recordStripeRefundWebhook(refund.id, "succeeded", orderId);
    } else if (refund.status === "failed" || refund.status === "canceled") {
      await recordStripeRefundWebhook(refund.id, "failed", orderId);
    }
  }

  private static async recordCouponRedemption(event: Stripe.Event) {
    const payment = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
    if (
      event.type === "payment_intent.canceled"
      || event.type === "checkout.session.expired"
    ) {
      const metadata = payment.metadata ?? {};
      const orderId = metadata.glam_too_order_id;
      if (metadata.store === "Glam Too" && orderId) {
        await cancelPendingOrder(orderId, payment.id);
        return;
      }
      await releaseCouponReservation(payment.id);
      await releaseInventoryReservation(payment.id);
      return;
    }
    const isSucceededPaymentIntent = event.type === "payment_intent.succeeded";
    const isPaidCheckoutSession = (
      event.type === "checkout.session.completed"
      || event.type === "checkout.session.async_payment_succeeded"
    ) && (payment as Stripe.Checkout.Session).payment_status === "paid";
    if (!isSucceededPaymentIntent && !isPaidCheckoutSession) return;

    const metadata = payment.metadata ?? {};
    if (metadata.store === "Glam Too") {
      const orderId = metadata.glam_too_order_id;
      if (orderId) {
        const order = await finalizePaidOrder(
          orderId,
          payment.id,
          paymentDetails(payment, isSucceededPaymentIntent),
        );
        if (order) {
          if (order.accountCreation === "pending") throw new Error("Paid checkout account creation needs retry");
          await attemptPaymentRefund(
            await getUncachableStripeClient(),
            orderId,
            order,
            payment,
            isSucceededPaymentIntent,
          );
        }
        return;
      }
      await commitInventoryReservation(payment.id);
    }
    const couponId = Number(metadata.coupon_id);
    const userId = metadata.clerk_user_id;
    if (
      metadata.store !== "Glam Too"
      || !Number.isInteger(couponId)
      || couponId <= 0
      || !userId
    ) {
      return;
    }

    await recordCouponRedemption(
      couponId,
      isSucceededPaymentIntent
        ? (payment as Stripe.PaymentIntent).id
        : (payment as Stripe.Checkout.Session).id,
      userId,
      Number(metadata.coupon_discount) || 0,
    );
  }
}

function paymentDetails(payment: Stripe.PaymentIntent | Stripe.Checkout.Session, isPaymentIntent: boolean) {
  const metadata = payment.metadata ?? {};
  const paymentRecord = payment as unknown as Record<string, unknown>;
  const details = isPaymentIntent
    ? (payment as Stripe.PaymentIntent).shipping as unknown as Record<string, unknown>
    : (paymentRecord.shipping_details ?? paymentRecord.customer_details) as Record<string, unknown>;
  const address = details?.address && typeof details.address === "object"
    ? details.address as Record<string, unknown>
    : {};
  const customerDetails = !isPaymentIntent && paymentRecord.customer_details && typeof paymentRecord.customer_details === "object"
    ? paymentRecord.customer_details as Record<string, unknown>
    : {};
  const text = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";
  return {
    accountRequest: metadata.create_account === "true" && metadata.guest_checkout_id && !metadata.clerk_user_id
      ? { guestOwner: metadata.guest_checkout_id, firstName: metadata.account_first_name || "", lastName: metadata.account_last_name || "" }
      : undefined,
    email: isPaymentIntent
      ? (payment as Stripe.PaymentIntent).receipt_email || metadata.customer_email
      : text(customerDetails.email, 250) || metadata.customer_email,
    customerName: text(details?.name, 120) || metadata.customer_name,
    phone: text(details?.phone, 40),
    address: {
      line1: text(address.line1, 200),
      line2: text(address.line2, 200),
      city: text(address.city, 100),
      postcode: text(address.postal_code, 40),
      country: text(address.country, 2).toUpperCase(),
    },
  };
}
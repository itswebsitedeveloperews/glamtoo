import Stripe from "stripe";
import { recordCouponRedemption, releaseCouponReservation } from "./couponService";
import { getStripeSync } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be provided as a Buffer.");
    }

    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
    await WebhookHandlers.recordCouponRedemption(event);
  }

  private static async recordCouponRedemption(event: Stripe.Event) {
    const payment = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
    if (
      event.type === "payment_intent.canceled"
      || event.type === "checkout.session.expired"
    ) {
      await releaseCouponReservation(payment.id);
      return;
    }
    const isSucceededPaymentIntent = event.type === "payment_intent.succeeded";
    const isPaidCheckoutSession = (
      event.type === "checkout.session.completed"
      || event.type === "checkout.session.async_payment_succeeded"
    ) && (payment as Stripe.Checkout.Session).payment_status === "paid";
    if (!isSucceededPaymentIntent && !isPaidCheckoutSession) return;

    const metadata = payment.metadata ?? {};
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
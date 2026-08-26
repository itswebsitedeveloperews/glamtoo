import { getStripeSync } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be provided as a Buffer.");
    }

    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);
  }
}
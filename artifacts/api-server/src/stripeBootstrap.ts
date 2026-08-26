import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

export async function initializeStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe.");
  }

  await runMigrations({ databaseUrl });
  const stripeSync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) {
    throw new Error("REPLIT_DOMAINS is required to configure the Stripe webhook.");
  }

  await stripeSync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  await stripeSync.syncBackfill();
}
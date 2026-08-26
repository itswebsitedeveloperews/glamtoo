import { integer, text, timestamp, pgTable } from "drizzle-orm/pg-core";

export const stripeCredentialsTable = pgTable("stripe_credentials", {
  id: integer("id").primaryKey(),
  encryptedSecretKey: text("encrypted_secret_key"),
  encryptedPublishableKey: text("encrypted_publishable_key"),
  encryptedWebhookSecret: text("encrypted_webhook_secret"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
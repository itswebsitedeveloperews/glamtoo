import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const gmailOAuthCredentialsTable = pgTable("store_gmail_oauth_credentials", {
  id: integer("id").primaryKey(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  clientBinding: text("client_binding").notNull(),
  enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const gmailOAuthStatesTable = pgTable("store_gmail_oauth_states", {
  nonceHash: text("nonce_hash").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  encryptedVerifier: text("encrypted_verifier").notNull(),
  clientBinding: text("client_binding").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const insertGmailOAuthCredentialsSchema = createInsertSchema(gmailOAuthCredentialsTable);
export const insertGmailOAuthStateSchema = createInsertSchema(gmailOAuthStatesTable);

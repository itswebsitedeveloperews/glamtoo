import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const contactNotificationSettingsTable = pgTable("store_contact_notification_settings", {
  id: integer("id").primaryKey(),
  adminEmail: text("admin_email").notNull().default(""),
  adminEmails: text("admin_emails").array().notNull().default([]),
  orderAdminEmails: text("order_admin_emails").array().notNull().default([]),
  fallbackAdminEmail: text("fallback_admin_email").notNull().default(""),
  orderEnabled: boolean("order_enabled").notNull().default(false),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertContactNotificationSettingsSchema = createInsertSchema(contactNotificationSettingsTable);

import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { storeOrdersTable } from "./orders";

export const orderEmailNotificationsTable = pgTable("store_order_email_notifications", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => storeOrdersTable.id, { onDelete: "cascade" }),
  notificationType: text("notification_type").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orderNotificationUnique: unique("store_order_email_notifications_order_type_unique").on(
    table.orderId,
    table.notificationType,
  ),
}));
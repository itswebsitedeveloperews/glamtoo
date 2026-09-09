import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const contactEnquiriesTable = pgTable("contact_enquiries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  orderNumber: text("order_number"),
  topic: text("topic").notNull(),
  message: text("message").notNull(),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveryError: text("delivery_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export type ContactEnquiry = typeof contactEnquiriesTable.$inferSelect;
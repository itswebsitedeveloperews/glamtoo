import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "Processing",
  "Shipped",
  "Delivered",
]);

export const orderFulfillmentTable = pgTable("order_fulfillment", {
  stripeSessionId: text("stripe_session_id").primaryKey(),
  status: fulfillmentStatusEnum("status").notNull().default("Processing"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
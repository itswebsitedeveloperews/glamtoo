import { integer, pgEnum, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { fulfillmentStatusEnum } from "./order-fulfillment";

export const orderPaymentStatusEnum = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "cancelled",
]);

export const storeOrdersTable = pgTable("store_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  paymentReference: text("payment_reference").unique(),
  paymentType: text("payment_type"),
  paymentStatus: orderPaymentStatusEnum("payment_status").notNull().default("pending"),
  fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").notNull().default("Processing"),
  email: text("email").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull().default(""),
  addressLine1: text("address_line_1").notNull(),
  addressLine2: text("address_line_2").notNull().default(""),
  city: text("city").notNull(),
  postcode: text("postcode").notNull(),
  country: text("country").notNull().default("GB"),
  deliveryMethod: text("delivery_method").notNull(),
  subtotal: integer("subtotal").notNull(),
  deliveryAmount: integer("delivery_amount").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  total: integer("total").notNull(),
  vatAmount: integer("vat_amount").notNull().default(0),
  currency: text("currency").notNull().default("gbp"),
  couponId: integer("coupon_id"),
  couponCode: text("coupon_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderReconciliationStateTable = pgTable("order_reconciliation_state", {
  source: text("source").primaryKey(),
  cursor: text("cursor"),
  completed: integer("completed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeOrderItemsTable = pgTable("store_order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => storeOrdersTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  variationId: text("variation_id"),
  inventoryKey: text("inventory_key"),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitAmount: integer("unit_amount").notNull(),
  total: integer("total").notNull(),
}, (table) => ({
  orderLineUnique: unique("store_order_items_order_line_unique").on(
    table.orderId,
    table.productId,
    table.variationId,
  ),
}));
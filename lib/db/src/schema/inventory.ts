import { boolean, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const productInventoryTable = pgTable("product_inventory", {
  productId: text("product_id").primaryKey(),
  catalogProductId: text("catalog_product_id").notNull().default(""),
  variationId: text("variation_id"),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  unitAmount: integer("unit_amount").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const inventoryReservationsTable = pgTable("inventory_reservations", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productInventoryTable.productId),
  paymentReference: text("payment_reference").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  inventoryPaymentProductUnique: unique("inventory_reservations_payment_product_unique").on(table.paymentReference, table.productId),
}));
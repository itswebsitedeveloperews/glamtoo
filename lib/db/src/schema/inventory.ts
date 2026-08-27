import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const productInventoryTable = pgTable("product_inventory", {
  productId: text("product_id").primaryKey(),
  stock: integer("stock").notNull(),
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
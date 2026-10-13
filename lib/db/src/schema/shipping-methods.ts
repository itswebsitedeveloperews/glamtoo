import { boolean, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/** Configurable delivery options. Prices and thresholds are stored in pence. */
export const shippingMethodsTable = pgTable("shipping_methods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull().default(0),
  freeOver: integer("free_over"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // One-time adoption of merchant-approved legacy product advice; never overwrite later edits.
  deliveryAdviceImported: boolean("delivery_advice_imported").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({ nameUnique: unique("shipping_methods_name_unique").on(table.name) }));

export type ShippingMethod = typeof shippingMethodsTable.$inferSelect;
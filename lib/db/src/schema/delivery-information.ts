import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Global delivery information displayed on product detail pages. Costs are stored in pence. */
export const deliveryInformationTable = pgTable("delivery_information", {
  id: serial("id").primaryKey(),
  option: text("option").notNull(),
  information: text("information").notNull(),
  cost: integer("cost").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeliveryInformationSchema = createInsertSchema(deliveryInformationTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeliveryInformation = z.infer<typeof insertDeliveryInformationSchema>;
export type DeliveryInformation = typeof deliveryInformationTable.$inferSelect;
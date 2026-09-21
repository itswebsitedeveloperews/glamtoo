import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Global clothing size guide displayed on product detail pages. */
export const sizeGuideTable = pgTable("size_guide", {
  id: serial("id").primaryKey(),
  size: text("size").notNull(),
  ukSize: text("uk_size").notNull(),
  bust: text("bust").notNull(),
  waist: text("waist").notNull(),
  hips: text("hips").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSizeGuideSchema = createInsertSchema(sizeGuideTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSizeGuide = z.infer<typeof insertSizeGuideSchema>;
export type SizeGuideRow = typeof sizeGuideTable.$inferSelect;
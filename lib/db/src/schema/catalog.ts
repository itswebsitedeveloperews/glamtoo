import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeCatalogTable = pgTable("store_catalog", {
  id: integer("id").primaryKey(),
  products: jsonb("products").notNull(),
  categories: jsonb("categories").notNull(),
  homePage: jsonb("home_page"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreCatalogSchema = createInsertSchema(storeCatalogTable).omit({ updatedAt: true });
export type InsertStoreCatalog = z.infer<typeof insertStoreCatalogSchema>;
export type StoreCatalog = typeof storeCatalogTable.$inferSelect;
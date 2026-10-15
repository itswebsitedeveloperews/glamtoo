import { pgTable, serial, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

export const heroSlidesTable = pgTable("store_hero_slides", {
  id: serial("id").primaryKey(),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const heroInitializationTable = pgTable("store_hero_initialization", {
  id: integer("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

import { pgTable, serial, varchar, text, integer, boolean, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const announcementsTable = pgTable("store_announcements", {
  id: serial("id").primaryKey(),
  text: varchar("text", { length: 160 }).notNull(),
  link: text("link"),
  displayOrder: integer("display_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("store_announcements_text_check", sql`length(trim(${table.text})) > 0`),
  check("store_announcements_order_check", sql`${table.displayOrder} BETWEEN 0 AND 10000`),
  check("store_announcements_revision_check", sql`${table.revision} > 0`),
  index("store_announcements_display_idx").on(table.enabled, table.displayOrder, table.id),
]);

import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productReviewsTable = pgTable("product_reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("pending"),
  submissionId: uuid("submission_id").notNull().unique(),
  fingerprint: text("fingerprint").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
}, (table) => [
  check("product_reviews_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
  check("product_reviews_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  check("product_reviews_content_check", sql`length(btrim(${table.title})) BETWEEN 1 AND 120 AND length(btrim(${table.body})) BETWEEN 1 AND 3000 AND length(btrim(${table.displayName})) BETWEEN 1 AND 80`),
  index("product_reviews_public_idx").on(table.productId, table.status, table.createdAt, table.id),
  index("product_reviews_moderation_idx").on(table.status, table.createdAt, table.id),
]);

export const insertProductReviewSchema = createInsertSchema(productReviewsTable).omit({ id: true, createdAt: true, moderatedAt: true });
export type InsertProductReview = z.infer<typeof insertProductReviewSchema>;
export type ProductReview = typeof productReviewsTable.$inferSelect;

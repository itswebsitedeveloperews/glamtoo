import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wishlistsTable = pgTable(
  "store_wishlists",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    productId: integer("product_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userProductUnique: unique("store_wishlists_user_product_unique").on(
      table.userId,
      table.productId,
    ),
  }),
);

export const insertWishlistSchema = createInsertSchema(wishlistsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWishlist = z.infer<typeof insertWishlistSchema>;
export type Wishlist = typeof wishlistsTable.$inferSelect;
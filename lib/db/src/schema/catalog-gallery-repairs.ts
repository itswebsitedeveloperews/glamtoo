import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Operational receipt and full pre-repair catalog backup. Keeping this in the
// managed schema prevents later schema pushes from dropping recovery evidence.
export const catalogGalleryRepairsTable = pgTable("catalog_gallery_repairs", {
  id: text("id").primaryKey(),
  catalogBefore: jsonb("catalog_before").notNull(),
  restoredImages: jsonb("restored_images").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const listingPreviewWarmupsTable = pgTable("listing_preview_warmups", {
  sourcePath: text("source_path").primaryKey(),
  version: text("version").notNull(),
  state: text("state").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseToken: text("lease_token"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

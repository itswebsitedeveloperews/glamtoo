import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Singleton global return policy displayed on product detail pages. */
export const returnInformationTable = pgTable("return_information", {
  id: integer("id").primaryKey().default(1),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReturnInformationSchema = createInsertSchema(returnInformationTable);
export type InsertReturnInformation = z.infer<typeof insertReturnInformationSchema>;
export type ReturnInformation = typeof returnInformationTable.$inferSelect;
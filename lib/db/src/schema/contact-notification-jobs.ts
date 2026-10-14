import { pgTable, integer, serial, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { contactEnquiriesTable } from "./contact-enquiries";

export const contactNotificationJobsTable = pgTable("contact_notification_jobs", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id").notNull().references(() => contactEnquiriesTable.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  messageId: text("message_id").notNull().unique(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contact_notification_jobs_due_idx").on(table.status, table.nextAttemptAt),
  unique("contact_notification_jobs_enquiry_recipient_unique").on(table.enquiryId, table.recipient),
]);

export const insertContactNotificationJobSchema = createInsertSchema(contactNotificationJobsTable);
export type ContactNotificationJob = typeof contactNotificationJobsTable.$inferSelect;

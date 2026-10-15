import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

// Separate from business outboxes: no worker claims or retries these samples.
export const emailBrandingTestsTable = pgTable("store_email_branding_tests", {
  approvalKey: text("approval_key").notNull(),
  variant: text("variant").notNull(),
  recipient: text("recipient").notNull(),
  marker: text("marker").notNull(),
  messageId: text("message_id").notNull().unique(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  adminUserId: text("admin_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.approvalKey, table.variant] })]);

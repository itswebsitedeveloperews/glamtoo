import { pgTable, text, jsonb, timestamp, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";

export const checkoutAttemptsTable = pgTable("checkout_attempts", {
  ownerId: text("owner_id").notNull(),
  retryKey: text("retry_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  networkId: text("network_id").notNull(),
  orderId: text("order_id").notNull(),
  plan: jsonb("plan"),
  providerParams: jsonb("provider_params"),
  response: jsonb("response"),
  providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.retryKey] }),
  uniqueIndex("checkout_attempts_order_unique").on(table.orderId),
  index("checkout_attempts_network_index").on(table.networkId),
]);

export const checkoutRateWindowsTable = pgTable("checkout_rate_windows", {
  key: text("key").primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(1),
});

export const stripeCustomerMappingsTable = pgTable("stripe_customer_mappings", {
  scope: text("scope").notNull(),
  userId: text("user_id").notNull(),
  customerId: text("customer_id").notNull(),
}, (table) => [primaryKey({ columns: [table.scope, table.userId] })]);

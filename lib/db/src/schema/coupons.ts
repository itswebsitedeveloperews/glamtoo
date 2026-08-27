import { pgEnum, pgTable, serial, integer, text, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponDiscountTypeEnum = pgEnum("coupon_discount_type", ["percentage", "fixed"]);

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: couponDiscountTypeEnum("discount_type").notNull(),
  discountValue: integer("discount_value").notNull(),
  active: boolean("active").notNull().default(true),
  startsAt: date("starts_at", { mode: "string" }),
  endsAt: date("ends_at", { mode: "string" }),
  minimumSpend: integer("minimum_spend").notNull().default(0),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id),
  paymentReference: text("payment_reference").notNull().unique(),
  userId: text("user_id").notNull(),
  discountAmount: integer("discount_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  couponPaymentReferenceUnique: unique("coupon_redemptions_coupon_payment_unique").on(table.couponId, table.paymentReference),
}));

export const couponReservationsTable = pgTable("coupon_reservations", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id),
  paymentReference: text("payment_reference").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  couponUserUnique: unique("coupon_reservations_coupon_user_unique").on(table.couponId, table.userId),
  couponPaymentReferenceUnique: unique("coupon_reservations_coupon_payment_unique").on(table.couponId, table.paymentReference),
}));

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
export type CouponRedemption = typeof couponRedemptionsTable.$inferSelect;
export type CouponReservation = typeof couponReservationsTable.$inferSelect;
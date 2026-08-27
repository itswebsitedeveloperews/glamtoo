import { eq } from "drizzle-orm";
import { couponsTable, db, pool, type Coupon } from "@workspace/db";

export type CouponDiscountType = "percentage" | "fixed";

export type CouponPricing = {
  coupon: Coupon;
  discountAmount: number;
  subtotal: number;
  deliveryAmount: number;
  total: number;
};

export class CouponValidationError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "CouponValidationError";
  }
}

export function normalizeCouponCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function parseCouponDate(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CouponValidationError(`${fieldName} must be a valid date.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CouponValidationError(`${fieldName} must be a valid date.`);
  }
  return value;
}

function integerValue(value: unknown, fieldName: string, options: { minimum: number; optional?: boolean }) {
  if ((value === null || value === undefined || value === "") && options.optional) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < options.minimum) {
    throw new CouponValidationError(`${fieldName} must be a whole number of at least ${options.minimum}.`);
  }
  return parsed;
}

export function validateCouponInput(input: Record<string, unknown>, partial = false) {
  const code = input.code === undefined && partial ? undefined : normalizeCouponCode(input.code);
  if (code !== undefined && !/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    throw new CouponValidationError("Coupon codes must be 3–40 characters using letters, numbers, hyphens, or underscores.");
  }

  const discountType = input.discountType === undefined && partial
    ? undefined
    : input.discountType;
  if (discountType !== undefined && discountType !== "percentage" && discountType !== "fixed") {
    throw new CouponValidationError("Choose a percentage or fixed discount.");
  }

  const discountValue = input.discountValue === undefined && partial
    ? undefined
    : integerValue(input.discountValue, "Discount value", { minimum: 1 });
  if (discountType === "percentage" && discountValue !== undefined && discountValue !== null && discountValue > 100) {
    throw new CouponValidationError("Percentage discounts must be between 1 and 100.");
  }

  const startsAt = input.startsAt === undefined && partial ? undefined : parseCouponDate(input.startsAt, "Start date");
  const endsAt = input.endsAt === undefined && partial ? undefined : parseCouponDate(input.endsAt, "End date");
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new CouponValidationError("End date must be on or after the start date.");
  }

  const minimumSpend = input.minimumSpend === undefined && partial
    ? undefined
    : integerValue(input.minimumSpend, "Minimum spend", { minimum: 0 });
  const usageLimit = input.usageLimit === undefined && partial
    ? undefined
    : integerValue(input.usageLimit, "Usage limit", { minimum: 1, optional: true });
  const active = input.active === undefined && partial ? undefined : input.active;
  if (active !== undefined && typeof active !== "boolean") {
    throw new CouponValidationError("Active must be true or false.");
  }

  return {
    ...(code === undefined ? {} : { code }),
    ...(discountType === undefined ? {} : { discountType: discountType as CouponDiscountType }),
    ...(discountValue === undefined ? {} : { discountValue }),
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(endsAt === undefined ? {} : { endsAt }),
    ...(minimumSpend === undefined ? {} : { minimumSpend }),
    ...(usageLimit === undefined ? {} : { usageLimit }),
    ...(active === undefined ? {} : { active }),
  };
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function calculateCouponPricing(
  codeValue: unknown,
  subtotal: number,
  deliveryAmount: number,
): Promise<CouponPricing> {
  const code = normalizeCouponCode(codeValue);
  if (!code) throw new CouponValidationError("Enter a coupon code.");
  if (!Number.isInteger(subtotal) || subtotal < 0 || !Number.isInteger(deliveryAmount) || deliveryAmount < 0) {
    throw new CouponValidationError("The order total could not be calculated.");
  }

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
  if (!coupon) throw new CouponValidationError("That coupon code is not recognised.");
  if (!coupon.active) throw new CouponValidationError("That coupon is no longer active.");

  const today = currentDate();
  if (coupon.startsAt && today < coupon.startsAt) throw new CouponValidationError("That coupon is not available yet.");
  if (coupon.endsAt && today > coupon.endsAt) throw new CouponValidationError("That coupon has expired.");
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new CouponValidationError("That coupon has reached its usage limit.");
  }
  if (subtotal < coupon.minimumSpend) {
    throw new CouponValidationError(`Spend at least £${(coupon.minimumSpend / 100).toFixed(2)} to use this coupon.`);
  }

  const eligibleAmount = subtotal + deliveryAmount;
  const discountAmount = coupon.discountType === "percentage"
    ? Math.min(eligibleAmount, Math.floor(eligibleAmount * coupon.discountValue / 100))
    : Math.min(eligibleAmount, coupon.discountValue);
  return {
    coupon,
    discountAmount,
    subtotal,
    deliveryAmount,
    total: Math.max(0, eligibleAmount - discountAmount),
  };
}

export async function recordCouponRedemption(
  couponId: number,
  paymentReference: string,
  userId: string,
  discountAmount: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const couponResult = await client.query<{
      id: number;
      usage_limit: number | null;
      usage_count: number;
    }>(
      "SELECT id, usage_limit, usage_count FROM coupons WHERE id = $1 FOR UPDATE",
      [couponId],
    );
    const coupon = couponResult.rows[0];
    if (!coupon) throw new CouponValidationError("The coupon attached to this payment no longer exists.");

    const existing = await client.query<{ id: number }>(
      "SELECT id FROM coupon_redemptions WHERE payment_reference = $1 LIMIT 1",
      [paymentReference],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return false;
    }
    const reservation = await client.query<{ id: number }>(
      "SELECT id FROM coupon_reservations WHERE payment_reference = $1 FOR UPDATE",
      [paymentReference],
    );
    if (coupon.usage_limit !== null && !reservation.rows[0]) {
      throw new CouponValidationError("This payment no longer has a valid coupon allocation.");
    }

    await client.query(
      `INSERT INTO coupon_redemptions (coupon_id, payment_reference, user_id, discount_amount)
       VALUES ($1, $2, $3, $4)`,
      [couponId, paymentReference, userId, discountAmount],
    );
    await client.query(
      "UPDATE coupons SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1",
      [couponId],
    );
    await client.query("DELETE FROM coupon_reservations WHERE payment_reference = $1", [paymentReference]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveCouponRedemption(
  coupon: Coupon,
  paymentReference: string,
  userId: string,
  expiresAt: Date,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const couponResult = await client.query<{
      id: number;
      active: boolean;
      usage_limit: number | null;
      usage_count: number;
    }>(
      "SELECT id, active, usage_limit, usage_count FROM coupons WHERE id = $1 FOR UPDATE",
      [coupon.id],
    );
    const currentCoupon = couponResult.rows[0];
    if (!currentCoupon || !currentCoupon.active) {
      throw new CouponValidationError("That coupon is no longer active.");
    }
    const existingRedemption = await client.query<{ id: number }>(
      "SELECT id FROM coupon_redemptions WHERE payment_reference = $1 LIMIT 1",
      [paymentReference],
    );
    const existingReservation = await client.query<{ id: number }>(
      "SELECT id FROM coupon_reservations WHERE payment_reference = $1 LIMIT 1",
      [paymentReference],
    );
    if (existingRedemption.rows[0] || existingReservation.rows[0]) {
      await client.query("COMMIT");
      return false;
    }

    const customerReservation = await client.query<{ payment_reference: string }>(
      `SELECT payment_reference FROM coupon_reservations
       WHERE coupon_id = $1 AND user_id = $2
       LIMIT 1`,
      [coupon.id, userId],
    );
    if (customerReservation.rows[0]) {
      throw new CouponValidationError("You already have a checkout in progress with this coupon.");
    }

    const reservations = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM coupon_reservations WHERE coupon_id = $1",
      [coupon.id],
    );
    if (
      currentCoupon.usage_limit !== null
      && currentCoupon.usage_count + Number(reservations.rows[0]?.count ?? 0) >= currentCoupon.usage_limit
    ) {
      throw new CouponValidationError("That coupon has reached its usage limit.");
    }

    await client.query(
      `INSERT INTO coupon_reservations (coupon_id, payment_reference, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [coupon.id, paymentReference, userId, expiresAt],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseCouponReservation(paymentReference: string) {
  await pool.query("DELETE FROM coupon_reservations WHERE payment_reference = $1", [paymentReference]);
}

type CouponUpdate = Pick<Coupon, "code" | "discountType" | "discountValue" | "startsAt" | "endsAt" | "minimumSpend" | "usageLimit" | "active">;

export async function updateCouponWithUsageLimit(couponId: number, update: CouponUpdate) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ id: number; usage_count: number }>(
      "SELECT id, usage_count FROM coupons WHERE id = $1 FOR UPDATE",
      [couponId],
    );
    if (!current.rows[0]) {
      await client.query("COMMIT");
      return undefined;
    }
    const reservations = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM coupon_reservations WHERE coupon_id = $1",
      [couponId],
    );
    if (
      update.usageLimit !== null
      && current.rows[0].usage_count + Number(reservations.rows[0]?.count ?? 0) > update.usageLimit
    ) {
      throw new CouponValidationError("Usage limit cannot be lower than completed or in-progress uses.");
    }

    const result = await client.query<{
      id: number;
      code: string;
      discount_type: CouponDiscountType;
      discount_value: number;
      active: boolean;
      starts_at: string | null;
      ends_at: string | null;
      minimum_spend: number;
      usage_limit: number | null;
      usage_count: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE coupons
       SET code = $2, discount_type = $3, discount_value = $4, starts_at = $5, ends_at = $6,
           minimum_spend = $7, usage_limit = $8, active = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        couponId,
        update.code,
        update.discountType,
        update.discountValue,
        update.startsAt,
        update.endsAt,
        update.minimumSpend,
        update.usageLimit,
        update.active,
      ],
    );
    await client.query("COMMIT");
    const row = result.rows[0];
    return row && {
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      active: row.active,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      minimumSpend: row.minimum_spend,
      usageLimit: row.usage_limit,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCouponById(id: number) {
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.id, id)).limit(1);
  return coupon;
}
import { asc, eq } from "drizzle-orm";
import { db, shippingMethodsTable, type ShippingMethod } from "@workspace/db";
import { calculateShippingAmount } from "@workspace/shipping";

export const LEGACY_STANDARD = { id: "standard", name: "Standard delivery", description: "2–4 working days", price: 395, freeOver: 7500 };
export const LEGACY_EXPRESS = { id: "express", name: "Express delivery", description: "1–2 working days", price: 695, freeOver: null };

export async function seedShippingMethods() {
  const existing = await db.select({ id: shippingMethodsTable.id }).from(shippingMethodsTable).limit(1);
  if (existing.length) return;
  await db.insert(shippingMethodsTable).values([
    { name: "Standard", description: "2–4 working days", price: 395, freeOver: 7500, enabled: true, sortOrder: 0 },
    { name: "Express", description: "1–2 working days", price: 695, freeOver: null, enabled: true, sortOrder: 1 },
  ]).onConflictDoNothing();
}

export async function listShippingMethods(enabledOnly = false) {
  await seedShippingMethods();
  return db.select().from(shippingMethodsTable)
    .where(enabledOnly ? eq(shippingMethodsTable.enabled, true) : undefined)
    .orderBy(asc(shippingMethodsTable.sortOrder), asc(shippingMethodsTable.id));
}

export async function resolveShippingMethod(value: unknown, subtotal: number) {
  const methods = await listShippingMethods(true);
  const requested = typeof value === "string" ? value.trim() : "";
  const method = methods.find((item) => String(item.id) === requested || item.name.toLowerCase() === requested.toLowerCase())
    ?? (requested === "standard" ? methods.find((item) => item.name.toLowerCase() === "standard") : undefined)
    ?? (requested === "express" ? methods.find((item) => item.name.toLowerCase() === "express") : undefined);
  if (!method) throw new Error("Choose an available delivery method.");
  const amount = calculateShippingAmount(method, subtotal);
  return { method, amount };
}

export function serializeShippingMethod(method: ShippingMethod) {
  return { id: String(method.id), name: method.name, description: method.description, price: method.price, freeOver: method.freeOver, enabled: method.enabled, sortOrder: method.sortOrder };
}
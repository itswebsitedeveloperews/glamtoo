export const STANDARD_DELIVERY_AMOUNT = 395;
export const EXPRESS_DELIVERY_AMOUNT = 695;
export const FREE_STANDARD_DELIVERY_THRESHOLD = 7500;

export type DeliveryMethod = "standard" | "express";

export function calculateDeliveryAmount(method: DeliveryMethod, subtotal: number) {
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    throw new Error("The delivery amount could not be calculated.");
  }

  if (method === "express") return EXPRESS_DELIVERY_AMOUNT;
  return subtotal >= FREE_STANDARD_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_AMOUNT;
}
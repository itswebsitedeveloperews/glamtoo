export const VAT_RATE_PERCENT = 20;

/**
 * Glam Too prices are VAT-inclusive. At 20% VAT, the tax portion of a
 * VAT-inclusive gross amount is gross × 20 / 120 (one sixth).
 */
export function calculateIncludedVat(grossAmount: number) {
  if (!Number.isInteger(grossAmount) || grossAmount < 0) {
    throw new Error("The taxable order amount must be a non-negative whole number.");
  }
  return Math.round(grossAmount * VAT_RATE_PERCENT / (100 + VAT_RATE_PERCENT));
}
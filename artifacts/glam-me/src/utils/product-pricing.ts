import type { CatalogProduct } from "../data/catalog";

type PricingProduct = Pick<CatalogProduct, "type" | "price" | "variations">;
const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function priceAmount(price: string) {
  const value = price.trim().replace(/^£\s*/, "").replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** Parent prices are administrative values, not offers for variable products. */
export function getProductPricing(product: PricingProduct) {
  const prices = product.type === "Variable"
    ? product.variations.filter((variation) => variation.stock > 0).map((variation) => variation.price)
    : [product.price];
  const amounts = prices.map(priceAmount).filter((amount): amount is number => amount !== null);
  const min = amounts.length ? Math.min(...amounts) : null;
  const max = amounts.length ? Math.max(...amounts) : null;
  const label = min === null || max === null
    ? product.type === "Variable" && !prices.length ? "Out of stock" : "Price unavailable"
    : min === max ? currency.format(min) : `${currency.format(min)} – ${currency.format(max)}`;
  return { amounts, min, max, label };
}

/** A stored variable line must resolve to an actual variant, never the parent price. */
export function getCartLineAmount(product: PricingProduct, variationId?: number) {
  const price = product.type === "Variable"
    ? product.variations.find((variation) => variation.id === variationId)?.price
    : product.price;
  return price === undefined ? null : priceAmount(price);
}

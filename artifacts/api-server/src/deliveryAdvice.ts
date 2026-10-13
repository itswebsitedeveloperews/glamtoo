type LegacyAdvice = { option: string; information: string; cost: number };
type Method = { name: string; description: string; price: number };

export function deliveryServiceKey(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[–-]/g, " ").replace(/\s+/g, " ");
  if (["standard", "standard delivery", "uk standard"].includes(normalized)) return "standard";
  if (["express", "express delivery", "uk next day", "next day"].includes(normalized)) return "next-day";
  if (["uk saturday", "uk saturday delivery", "saturday", "saturday delivery"].includes(normalized)) return "saturday";
  return normalized;
}

/** Import only an unambiguous matching service; do not guess a price for custom methods. */
export function approvedDeliveryAdvice(method: Method, advice: LegacyAdvice[]) {
  const matches = advice.filter((row) => deliveryServiceKey(row.option) === deliveryServiceKey(method.name));
  if (matches.length > 1) throw new Error(`Delivery advice has duplicate entries for ${method.name}.`);
  const row = matches[0];
  return row ? { name: row.option, description: row.information, price: row.cost } : {};
}

export function deliveryInformationFromShipping(method: {
  id: number; name: string; description: string; price: number; freeOver: number | null; sortOrder: number;
}) {
  return {
    id: method.id,
    option: method.name,
    information: method.description,
    cost: method.price,
    freeOver: method.freeOver,
    sortOrder: method.sortOrder,
  };
}

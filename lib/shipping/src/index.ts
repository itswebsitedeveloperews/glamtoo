export type ShippingRate = { price: number; freeOver: number | null };
export type ShippingMethod = ShippingRate & {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

/** All inputs and the result are integer pennies. Eligibility uses the pre-discount subtotal. */
export function calculateShippingAmount(method: ShippingRate, subtotal: number): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0
    || !Number.isSafeInteger(method.price) || method.price < 0
    || (method.freeOver !== null && (!Number.isSafeInteger(method.freeOver) || method.freeOver < 0))) {
    throw new Error("The delivery amount could not be calculated.");
  }
  return method.freeOver !== null && subtotal >= method.freeOver ? 0 : method.price;
}

/** Keep the previously chosen enabled service, otherwise use the API's ordered default. */
export function selectShippingMethod(methods: ShippingMethod[], selectedId?: string): ShippingMethod | undefined {
  const enabled = methods.filter((method) => method.enabled);
  return enabled.find((method) => method.id === selectedId || method.name.toLowerCase() === selectedId?.toLowerCase())
    ?? enabled[0];
}

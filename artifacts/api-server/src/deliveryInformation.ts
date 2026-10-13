import { listShippingMethods } from "./shippingMethods";
import { deliveryInformationFromShipping } from "./deliveryAdvice";

export async function listDeliveryInformation() {
  return (await listShippingMethods(true)).map(deliveryInformationFromShipping);
}

export function serializeDeliveryInformation(item: ReturnType<typeof deliveryInformationFromShipping>) {
  return {
    id: String(item.id),
    option: item.option,
    information: item.information,
    cost: item.cost,
    freeOver: item.freeOver,
    sortOrder: item.sortOrder,
  };
}
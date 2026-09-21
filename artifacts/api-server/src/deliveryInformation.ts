import { asc } from "drizzle-orm";
import { db, deliveryInformationTable, type DeliveryInformation } from "@workspace/db";

export async function listDeliveryInformation() {
  return db
    .select()
    .from(deliveryInformationTable)
    .orderBy(asc(deliveryInformationTable.sortOrder), asc(deliveryInformationTable.id));
}

export function serializeDeliveryInformation(item: DeliveryInformation) {
  return {
    id: String(item.id),
    option: item.option,
    information: item.information,
    cost: item.cost,
    sortOrder: item.sortOrder,
  };
}
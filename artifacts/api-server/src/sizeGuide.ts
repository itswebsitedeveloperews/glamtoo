import { asc } from "drizzle-orm";
import { db, sizeGuideTable, type SizeGuideRow } from "@workspace/db";

export async function listSizeGuide() {
  return db
    .select()
    .from(sizeGuideTable)
    .orderBy(asc(sizeGuideTable.sortOrder), asc(sizeGuideTable.id));
}

export function serializeSizeGuideRow(row: SizeGuideRow) {
  return {
    id: String(row.id),
    size: row.size,
    ukSize: row.ukSize,
    bust: row.bust,
    waist: row.waist,
    hips: row.hips,
    sortOrder: row.sortOrder,
  };
}
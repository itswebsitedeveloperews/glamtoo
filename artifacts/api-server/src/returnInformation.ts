import { db, returnInformationTable } from "@workspace/db";

export async function getReturnInformation() {
  const [row] = await db.select().from(returnInformationTable).limit(1);
  return { content: row?.content ?? "" };
}
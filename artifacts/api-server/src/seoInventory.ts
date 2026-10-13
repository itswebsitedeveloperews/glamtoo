import { pool } from "@workspace/db";
import type { SeoInventory } from "./seo";

/** Read the same active offers checkout uses; do not seed or modify inventory for SEO. */
export async function getSeoInventory(): Promise<SeoInventory> {
  const result = await pool.query<{ product_id: string; unit_amount: number; stock: number }>(
    "SELECT product_id, unit_amount, stock FROM product_inventory WHERE active = true",
  );
  return Object.fromEntries(result.rows.map((row) => [row.product_id, { unitAmount: row.unit_amount, stock: row.stock }]));
}

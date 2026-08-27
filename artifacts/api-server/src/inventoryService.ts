import { pool, type PoolClient } from "@workspace/db";
import { checkoutCatalog } from "./checkoutCatalog";

export type InventoryLine = {
  productId: string;
  quantity: number;
  name: string;
};

export class InventoryError extends Error {
  statusCode = 409;
}

function aggregateLines(lines: InventoryLine[]) {
  const quantities = new Map<string, InventoryLine>();
  for (const line of lines) {
    const current = quantities.get(line.productId);
    quantities.set(line.productId, current
      ? { ...current, quantity: current.quantity + line.quantity }
      : { ...line });
  }
  return [...quantities.values()];
}

async function seedInventory(client: PoolClient) {
  for (const product of Object.values(checkoutCatalog)) {
    await client.query(
      `INSERT INTO product_inventory (product_id, stock)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO NOTHING`,
      [product.id, product.stock],
    );
  }
}

export async function getInventoryLevels() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const result = await client.query<{ product_id: string; stock: number }>(
      "SELECT product_id, stock FROM product_inventory ORDER BY product_id",
    );
    await client.query("COMMIT");
    return Object.fromEntries(result.rows.map((row) => [row.product_id, row.stock]));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function setInventoryLevel(productId: string, stock: number) {
  if (!checkoutCatalog[productId]) throw new InventoryError("That product is not available for inventory updates.");
  if (!Number.isInteger(stock) || stock < 0) throw new InventoryError("Stock must be a whole number of zero or more.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const result = await client.query<{ stock: number }>(
      `UPDATE product_inventory
       SET stock = $2, updated_at = NOW()
       WHERE product_id = $1
       RETURNING stock`,
      [productId, stock],
    );
    await client.query("COMMIT");
    return result.rows[0]?.stock ?? stock;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveInventory(lines: InventoryLine[], paymentReference: string) {
  const requestedLines = aggregateLines(lines);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const existingReservation = await client.query(
      "SELECT 1 FROM inventory_reservations WHERE payment_reference = $1 LIMIT 1 FOR UPDATE",
      [paymentReference],
    );
    if (existingReservation.rowCount) {
      await client.query("COMMIT");
      return;
    }
    for (const line of requestedLines) {
      const current = await client.query<{ stock: number }>(
        "SELECT stock FROM product_inventory WHERE product_id = $1 FOR UPDATE",
        [line.productId],
      );
      const available = current.rows[0]?.stock;
      if (available === undefined) throw new InventoryError(`${line.name} is not available.`);
      if (available < line.quantity) {
        throw new InventoryError(
          available === 0
            ? `${line.name} is now out of stock.`
            : `Only ${available} of ${line.name} ${available === 1 ? "is" : "are"} left in stock.`,
        );
      }
      await client.query(
        "UPDATE product_inventory SET stock = stock - $2, updated_at = NOW() WHERE product_id = $1",
        [line.productId, line.quantity],
      );
      await client.query(
        `INSERT INTO inventory_reservations (product_id, payment_reference, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (payment_reference, product_id) DO NOTHING`,
        [line.productId, paymentReference, line.quantity],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseInventoryReservation(paymentReference: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservations = await client.query<{ product_id: string; quantity: number }>(
      `DELETE FROM inventory_reservations
       WHERE payment_reference = $1
       RETURNING product_id, quantity`,
      [paymentReference],
    );
    for (const reservation of reservations.rows) {
      await client.query(
        "UPDATE product_inventory SET stock = stock + $2, updated_at = NOW() WHERE product_id = $1",
        [reservation.product_id, reservation.quantity],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function commitInventoryReservation(paymentReference: string) {
  await pool.query("DELETE FROM inventory_reservations WHERE payment_reference = $1", [paymentReference]);
}
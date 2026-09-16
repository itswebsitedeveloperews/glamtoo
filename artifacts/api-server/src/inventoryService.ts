import { pool, type PoolClient } from "@workspace/db";
import { checkoutCatalog } from "./checkoutCatalog";

export type InventoryLine = {
  inventoryKey: string;
  productId: string;
  quantity: number;
  name: string;
};

export type CheckoutCatalogLine = {
  inventoryKey: string;
  productId: string;
  variationId?: string;
  name: string;
  description: string;
  unitAmount: number;
};

export type CatalogProductInput = {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  status: "Published" | "Draft";
  type: "Simple" | "Variable";
  variations: Array<{
    id: string;
    size: string;
    colour: string;
    attributes?: Record<string, string>;
    price: string;
    stock: number;
  }>;
};

export class InventoryError extends Error {
  statusCode = 409;
}

function formatVariationName(productName: string, size: string, colour: string, attributes?: Record<string, string>) {
  const options = [size, colour, ...Object.values(attributes ?? {})].filter(Boolean).join(" · ");
  return options ? `${productName} · ${options}` : productName;
}

function parseUnitAmount(price: string) {
  const value = Number.parseFloat(price.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function inventoryKey(productId: string, variationId?: string) {
  return variationId ? `${productId}:${variationId}` : productId;
}

function aggregateLines(lines: InventoryLine[]) {
  const quantities = new Map<string, InventoryLine>();
  for (const line of lines) {
    const current = quantities.get(line.inventoryKey);
    quantities.set(line.inventoryKey, current
      ? { ...current, quantity: current.quantity + line.quantity }
      : { ...line });
  }
  return [...quantities.values()];
}

async function seedInventory(client: PoolClient) {
  for (const product of Object.values(checkoutCatalog)) {
    await client.query(
      `INSERT INTO product_inventory (
        product_id, catalog_product_id, variation_id, name, description, unit_amount, stock, active
       ) VALUES ($1, $2, NULL, $3, $4, $5, $6, true)
       ON CONFLICT (product_id) DO UPDATE
       SET catalog_product_id = EXCLUDED.catalog_product_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           unit_amount = EXCLUDED.unit_amount,
           active = true
       WHERE product_inventory.catalog_product_id = ''`,
      [product.id, product.id, product.name, product.description, product.unitAmount, product.stock],
    );
  }
}

export async function getInventoryLevels() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const result = await client.query<{ product_id: string; stock: number }>(
      "SELECT product_id, stock FROM product_inventory WHERE active = true ORDER BY product_id",
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

export async function getCheckoutCatalogLine(productId: string, variationId?: string): Promise<CheckoutCatalogLine | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const result = await client.query<{
      product_id: string;
      catalog_product_id: string;
      variation_id: string | null;
      name: string;
      description: string;
      unit_amount: number;
    }>(
      `SELECT product_id, catalog_product_id, variation_id, name, description, unit_amount
       FROM product_inventory
       WHERE catalog_product_id = $1
         AND active = true
         AND ($2::text IS NULL AND variation_id IS NULL OR variation_id = $2)
       LIMIT 1`,
      [productId, variationId ?? null],
    );
    await client.query("COMMIT");
    const item = result.rows[0];
    return item
      ? {
        inventoryKey: item.product_id,
        productId: item.catalog_product_id,
        variationId: item.variation_id ?? undefined,
        name: item.name,
        description: item.description,
        unitAmount: item.unit_amount,
      }
      : null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function syncCatalogProduct(input: CatalogProductInput) {
  const saleItems = input.type === "Variable"
    ? input.variations.map((variation) => ({
      productId: input.id,
      variationId: variation.id,
      name: formatVariationName(input.name, variation.size, variation.colour, variation.attributes),
      description: input.description,
      unitAmount: parseUnitAmount(variation.price),
      stock: variation.stock,
      active: input.status === "Published",
    }))
    : [{
      productId: input.id,
      variationId: undefined,
      name: input.name,
      description: input.description,
      unitAmount: parseUnitAmount(input.price),
      stock: input.stock,
      active: input.status === "Published",
    }];
  if (!saleItems.length || saleItems.some((item) => !item.unitAmount || !Number.isInteger(item.stock) || item.stock < 0)) {
    throw new InventoryError("Every sellable product or variation needs a valid price and a whole stock quantity.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInventory(client);
    const activeKeys = saleItems.map((item) => inventoryKey(item.productId, item.variationId));
    await client.query(
      `UPDATE product_inventory
       SET active = false, updated_at = NOW()
       WHERE catalog_product_id = $1
         AND product_id <> ALL($2::text[])`,
      [input.id, activeKeys],
    );
    for (const item of saleItems) {
      const key = inventoryKey(item.productId, item.variationId);
      await client.query(
        `INSERT INTO product_inventory (
          product_id, catalog_product_id, variation_id, name, description, unit_amount, stock, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (product_id) DO UPDATE
        SET catalog_product_id = EXCLUDED.catalog_product_id,
            variation_id = EXCLUDED.variation_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            unit_amount = EXCLUDED.unit_amount,
            stock = EXCLUDED.stock,
            active = EXCLUDED.active,
            updated_at = NOW()`,
        [key, input.id, item.variationId ?? null, item.name, item.description, item.unitAmount, item.stock, item.active],
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
        [line.inventoryKey],
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
        [line.inventoryKey, line.quantity],
      );
      await client.query(
        `INSERT INTO inventory_reservations (product_id, payment_reference, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (payment_reference, product_id) DO NOTHING`,
        [line.inventoryKey, paymentReference, line.quantity],
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
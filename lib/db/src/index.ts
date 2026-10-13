import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Session advisory locks must not occupy the query pool while their work waits
// for another query connection. Customer locks are separate for nested checkout.
export const checkoutLockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
export const stripeCustomerLockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
export const db = drizzle(pool, { schema });

export * from "./schema";
export type { PoolClient } from "pg";

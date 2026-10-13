import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import { pool, checkoutLockPool, stripeCustomerLockPool, type PoolClient } from "@workspace/db";
import { cancelPendingOrder } from "./orderService";

export class CheckoutSafetyError extends Error {
  constructor(message: string, public statusCode = 409, public code = "checkout_conflict", public retryAfter = 60) { super(message); }
}

export function fingerprint(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") return Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "retryKey").sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
    );
    return input;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export type Attempt = {
  owner_id: string; retry_key: string; order_id: string; fingerprint: string;
  plan: any; provider_params: any; response: any; provider_started_at: Date | null;
};

export async function withDatabaseLock<T>(keys: string[], work: (client: PoolClient) => Promise<T>): Promise<T> {
  const lockPool = keys.every((key) => key.startsWith("stripe-customer:")) ? stripeCustomerLockPool : checkoutLockPool;
  const client = await lockPool.connect();
  const locked: string[] = [];
  try {
    // Session locks survive transaction commits and disappear on connection loss.
    // Fail quickly instead of exhausting the pool on concurrent browser retries.
    for (const key of [...new Set(keys)].sort()) {
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [key]);
      if (!result.rows[0].locked) throw new CheckoutSafetyError("Checkout is already being prepared. Retry this same attempt in a few seconds.", 429, "checkout_busy", 3);
      locked.push(key);
    }
    return await work(client);
  } finally {
    let discard = false;
    for (const key of locked.reverse()) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]); }
      catch { discard = true; }
    }
    client.release(discard);
  }
}

export async function consumeRate(client: PoolClient, key: string, maximum: number) {
  const result = await client.query<{ count: number }>(
    `INSERT INTO checkout_rate_windows (key, starts_at, count) VALUES ($1,NOW(),1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN checkout_rate_windows.starts_at < NOW() - interval '10 minutes' THEN 1 ELSE checkout_rate_windows.count + 1 END,
       starts_at = CASE WHEN checkout_rate_windows.starts_at < NOW() - interval '10 minutes' THEN NOW() ELSE checkout_rate_windows.starts_at END
     RETURNING count`, [key],
  );
  if (result.rows[0].count > maximum) throw new CheckoutSafetyError("Too many checkout attempts. Wait 10 minutes, then retry the same attempt. You do not need to sign in.", 429, "checkout_throttled", 600);
}

export async function withCheckoutAttempt<T>(
  request: Request, owner: string, kind: string,
  work: (attempt: Attempt, save: (field: "plan" | "provider_params" | "response", value: unknown) => Promise<void>) => Promise<T>,
): Promise<T> {
  const key = request.get("idempotency-key") ?? request.body?.retryKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) {
    throw new CheckoutSafetyError("Send a valid checkout retry key.", 400, "retry_key_required");
  }
  // Express accepts forwarded IPs only from configured trusted proxies.
  const network = createHash("sha256").update(request.ip ?? request.socket.remoteAddress ?? "unknown").digest("hex");
  return withDatabaseLock([`checkout-owner:${owner}`, `checkout-network:${network}`], async (client) => {
    await consumeRate(client, `owner:${owner}`, 40);
    await consumeRate(client, `network:${network}`, 80);
    const hash = fingerprint({ kind, body: request.body });
    const found = await client.query<Attempt>("SELECT * FROM checkout_attempts WHERE owner_id=$1 AND retry_key=$2", [owner, key]);
    let attempt = found.rows[0];
    if (attempt && attempt.fingerprint !== hash) throw new CheckoutSafetyError("This retry key belongs to different checkout details. Start a new attempt after resolving the earlier payment.");
    if (attempt) {
      const order = await client.query("SELECT payment_status FROM store_orders WHERE id=$1", [attempt.order_id]);
      if (order.rows[0]?.payment_status === "paid") throw new CheckoutSafetyError("This checkout is already paid. Check your order confirmation rather than paying again.", 409, "checkout_completed");
      if (order.rows[0]?.payment_status === "cancelled") throw new CheckoutSafetyError("This checkout was cancelled. Click Pay again to start a new attempt.", 409, "checkout_closed");
      // Stripe only guarantees idempotency retention for 24h. Never blindly
      // recreate an uncertain payment outside that window.
      if (!attempt.response && attempt.provider_started_at && Date.now() - new Date(attempt.provider_started_at).getTime() > 23 * 60 * 60 * 1000) {
        throw new CheckoutSafetyError("This payment needs recovery before another attempt can start. Contact the shop.", 409, "payment_recovery_required");
      }
    } else {
      const bounds = await client.query<{ owner_count: number; network_count: number }>(
        `SELECT
         COUNT(*) FILTER (WHERE a.owner_id=$1)::int AS owner_count,
         COUNT(*) FILTER (WHERE a.network_id=$2)::int AS network_count
         FROM checkout_attempts a LEFT JOIN store_orders o ON o.id=a.order_id
         WHERE (a.owner_id=$1 OR a.network_id=$2)
         AND (o.payment_status='pending' OR (o.id IS NULL AND (a.provider_started_at IS NOT NULL OR a.created_at > NOW()-interval '30 minutes')))`,
        [owner, network],
      );
      const legacy = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM store_orders o WHERE user_id=$1 AND payment_status='pending' AND NOT EXISTS (SELECT 1 FROM checkout_attempts a WHERE a.order_id=o.id)", [owner]);
      if (bounds.rows[0].owner_count + legacy.rows[0].count >= 3 || bounds.rows[0].network_count >= 10) {
        throw new CheckoutSafetyError("Too many checkouts are still pending. Finish or cancel an earlier payment, or retry after its payment expiry has been confirmed. Guest checkout remains available.", 429, "reservation_limit", 300);
      }
      const inserted = await client.query<Attempt>(
        "INSERT INTO checkout_attempts (owner_id,retry_key,fingerprint,network_id,order_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [owner, key, hash, network, `ord_${randomUUID().replace(/-/g, "")}`],
      );
      attempt = inserted.rows[0];
    }
    try { return await work(attempt, async (field, value) => {
      await client.query(`UPDATE checkout_attempts SET ${field}=$3::jsonb${field === "provider_params" ? ", provider_started_at=COALESCE(provider_started_at,NOW())" : ""} WHERE owner_id=$1 AND retry_key=$2`, [owner, key, JSON.stringify(value)]);
      attempt[field] = value;
    }); } catch (error) {
      // No external creation was even prepared: local allocations are safe to
      // release, unlike an ambiguous provider call with a saved payload.
      if (!attempt.provider_started_at && !attempt.provider_params) {
        await cancelPendingOrder(attempt.order_id).catch(() => undefined);
        await client.query("DELETE FROM checkout_attempts WHERE owner_id=$1 AND retry_key=$2", [owner, key]);
      }
      throw error;
    }
  });
}

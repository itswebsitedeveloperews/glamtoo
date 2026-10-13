import type Stripe from "stripe";
import { pool } from "@workspace/db";
import { withDatabaseLock } from "./checkoutSafety";
import { attachOrderPayment, cancelPendingOrder } from "./orderService";
import { stripeCustomerScope } from "./stripeCustomers";

/** Reattach uncertain creation before normal Stripe-verified expiry recovery. */
export async function recoverInterruptedCheckouts(stripe: Stripe) {
  const result = await pool.query(
    `SELECT a.* FROM checkout_attempts a JOIN store_orders o ON o.id=a.order_id
     WHERE o.payment_status='pending' AND o.payment_reference IS NULL
       AND o.expires_at<=NOW() ORDER BY a.created_at LIMIT 25`,
  );
  for (const attempt of result.rows) {
    try {
      await withDatabaseLock([`checkout-owner:${attempt.owner_id}`, `checkout-network:${attempt.network_id}`], async () => {
        // A creator may have finished since the scan; recheck under its lock.
        const current = await pool.query("SELECT payment_reference,payment_status FROM store_orders WHERE id=$1", [attempt.order_id]);
        if (current.rows[0]?.payment_reference || current.rows[0]?.payment_status !== "pending") return;
        if (!attempt.provider_started_at) {
          await cancelPendingOrder(attempt.order_id);
          return;
        }
        if (attempt.plan?.providerScope !== await stripeCustomerScope(stripe)) return;
        const kind = attempt.plan?.kind;
        const recent = Date.now() - new Date(attempt.provider_started_at).getTime() < 23 * 60 * 60 * 1000;
        let payment: any;
        if (recent) {
          payment = kind === "payment_intent"
            ? await stripe.paymentIntents.create(attempt.provider_params, { idempotencyKey: `checkout:${attempt.order_id}` })
            : await stripe.checkout.sessions.create(attempt.provider_params, { idempotencyKey: `checkout:${attempt.order_id}` });
        } else {
          // Never recreate after Stripe's key retention guarantee. Paginate
          // instead and leave capacity held if payment cannot be proven.
          let cursor: string | undefined;
          do {
            const options = { limit: 100, ...(cursor ? { starting_after: cursor } : {}) };
            const page = kind === "payment_intent" ? await stripe.paymentIntents.list(options) : await stripe.checkout.sessions.list(options);
            payment = page.data.find((item) => item.metadata?.glam_too_order_id === attempt.order_id && item.metadata?.store === "Glam Too");
            if (payment || !page.has_more) break;
            const next = page.data.at(-1)?.id;
            if (!next || next === cursor) throw new Error("Payment recovery pagination did not advance.");
            cursor = next;
          } while (true);
        }
        if (payment) await attachOrderPayment(attempt.order_id, payment.id, kind);
      });
    } catch {
      // Provider unavailable or creator still running: retain every allocation.
    }
  }
}

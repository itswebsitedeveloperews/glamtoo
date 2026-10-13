import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { withDatabaseLock } from "./checkoutSafety";

export async function stripeCustomerScope(stripe: Stripe): Promise<string> {
  const account = await stripe.accounts.retrieve(null);
  // Balance livemode identifies key mode without storing or hashing credentials.
  const balance = await stripe.balance.retrieve();
  return `${account.id}:${balance.livemode ? "live" : "test"}`;
}

export async function resolveStripeCustomer(stripe: Stripe, userId: string, details?: { email: string; name: string }) {
  const scope = await stripeCustomerScope(stripe);
  return withDatabaseLock([`stripe-customer:${scope}:${userId}`], async (client) => {
    const mapping = await client.query<{ customer_id: string }>("SELECT customer_id FROM stripe_customer_mappings WHERE scope=$1 AND user_id=$2", [scope, userId]);
    let customer: Stripe.Customer | undefined;
    if (mapping.rows[0]) {
      const mapped = await stripe.customers.retrieve(mapping.rows[0].customer_id);
      if (mapped.deleted || mapped.metadata.clerk_user_id !== userId) throw new Error("Saved customer identity could not be verified.");
      customer = mapped;
    } else {
      let cursor: string | undefined;
      do {
        const page = await stripe.customers.list({ limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
        customer = page.data.find((item) => item.metadata.clerk_user_id === userId);
        if (customer || !page.has_more) break;
        const next = page.data.at(-1)?.id;
        if (!next || next === cursor) throw new Error("Stripe customer pagination did not advance.");
        cursor = next;
      } while (true);
      if (!customer && details) {
        const idempotencyKey = createHash("sha256").update(`customer:${scope}:${userId}`).digest("hex");
        // Stable creation payload; mutable billing details are updated afterwards.
        customer = await stripe.customers.create({ metadata: { clerk_user_id: userId, store: "Glam Too" } }, { idempotencyKey });
      }
      if (customer) await client.query("INSERT INTO stripe_customer_mappings (scope,user_id,customer_id) VALUES ($1,$2,$3)", [scope, userId, customer.id]);
    }
    if (customer && details && (customer.email !== details.email || customer.name !== details.name)) {
      customer = await stripe.customers.update(customer.id, details);
    }
    return customer ?? null;
  });
}

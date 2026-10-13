/** Explicit development-only Clerk integration check; not part of the normal test suite. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { provisionCheckoutAccount } from "../src/checkoutAccount";
import { createPendingOrder } from "../src/orderService";

async function main() {
if (process.env.NODE_ENV !== "development") throw new Error("Run this check only in the development workspace.");
const orderIds: string[] = [];
const userIds: string[] = [];
const guest = `guest_${randomBytes(32).toString("hex")}`;
const email = `checkout-smoke-${randomBytes(8).toString("hex")}+clerk_test@example.com`;
try {
  const order = await createPendingOrder({
    userId: guest, email, customerName: "Checkout Smoke", phone: "07000000000",
    address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
    delivery: "Test only", subtotal: 1999, deliveryAmount: 0, discountAmount: 0,
    total: 1999, vatAmount: 333, expiresAt: new Date(Date.now() + 60000),
    items: [{ productId: "checkout_smoke_fixture", name: "Test only", quantity: 1, unitAmount: 1999, total: 1999 }],
  });
  orderIds.push(order.id);
  // Synthetic paid fixture only: no Stripe payment, no real stock or coupon.
  await pool.query("UPDATE store_orders SET payment_status='paid',paid_at=NOW() WHERE id=$1", [order.id]);
  assert.equal(await provisionCheckoutAccount(order.id, guest, "Checkout", "Smoke"), "created");
  const users = await clerkClient.users.getUserList({ externalId: [`glam_checkout_${order.id}`], limit: 1 });
  const user = users.data[0];
  assert.ok(user);
  userIds.push(user.id);
  assert.equal(user.firstName, "Checkout");
  assert.equal(user.lastName, "Smoke");
  assert.notEqual(user.emailAddresses[0].verification?.status, "verified");
  assert.equal(user.passwordEnabled, true);
  assert.equal(user.privateMetadata.role, null);
  assert.equal(await provisionCheckoutAccount(order.id, guest, "Checkout", "Smoke"), "created");
  const profile = (await pool.query("SELECT * FROM customer_profiles WHERE user_id=$1", [user.id])).rows[0];
  assert.equal(profile.postcode, "SW1A 1AA");
  assert.equal(profile.first_name, "Checkout");
  console.log("Development Clerk integration passed: reserved email, protected password, billing profile, order association and idempotent retry. No payment was created.");
} finally {
  // Also find any account created before a later assertion/API failure.
  for (const orderId of orderIds) {
    const page = await clerkClient.users.getUserList({ externalId: [`glam_checkout_${orderId}`], limit: 1 });
    for (const user of page.data) if (!userIds.includes(user.id)) userIds.push(user.id);
  }
  for (const userId of userIds) await clerkClient.users.deleteUser(userId);
  await pool.query("DELETE FROM customer_profiles WHERE user_id=ANY($1::text[])", [userIds]);
  await pool.query("DELETE FROM store_order_items WHERE order_id=ANY($1::text[])", [orderIds]);
  await pool.query("DELETE FROM store_orders WHERE id=ANY($1::text[])", [orderIds]);
  await pool.end();
}
}
void main().catch((error) => {
  // Never print provider response bodies, email addresses, passwords or tokens.
  console.error("Development account integration check failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { pool } from "@workspace/db";
import { createPendingOrder, finalizePaidOrder } from "../src/orderService";
import { buildOrderConfirmation } from "../src/orderConfirmationTemplate";
import { isOrderEmailConfigured, processOrderConfirmations, refreshOrderEmailDelivery } from "../src/orderConfirmationNotifications";
import { processRefundNotifications } from "../src/refundNotifications";

const runId = `email_test_${crypto.randomUUID().replace(/-/g, "")}`;
const recipient = `${runId}@example.test`;
const orders: string[] = [];
const requests: Record<string, any>[] = [];
const records = new Map<string, { to: string; messageId: string }>();
const originalFetch = globalThis.fetch;
let sendMode = "accepted";
let deliveryStatus = "sent";
let mismatchedRecipient = false;
let counter = 0;
const input = (guest = false) => ({
  userId: guest ? `guest_${runId}` : `user_${runId}`,
  email: recipient, customerName: "<Test Shopper>", phone: "",
  address: { line1: "1 Test Street", line2: "Test Flat", city: "London", postcode: "SW1A 1AA", country: "GB" },
  delivery: "UK Saturday delivery", subtotal: 7997, deliveryAmount: 899,
  discountAmount: 500, total: 8396, vatAmount: 1399,
  expiresAt: new Date(Date.now() + 60_000),
  items: [
    { productId: runId, variationId: `${runId}_ml`, name: "Military Style Jacket — M/L", quantity: 2, unitAmount: 2999, total: 5998 },
    { productId: `${runId}_bag`, name: "Mini Tote Bag", quantity: 1, unitAmount: 1999, total: 1999 },
  ],
});
async function pending(guest = false) {
  const order = await createPendingOrder(input(guest));
  orders.push(order.id);
  return order.id;
}
async function paid(guest = false) {
  const id = await pending(guest);
  await finalizePaidOrder(id, `pi_test_${id}`);
  return id;
}
async function notification(orderId: string) {
  return (await pool.query(
    "SELECT * FROM store_order_email_notifications WHERE order_id = $1 AND notification_type = 'order_confirmation'", [orderId],
  )).rows[0];
}
async function due(orderId: string) {
  await pool.query("UPDATE store_order_email_notifications SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE order_id = $1", [orderId]);
}

before(() => {
  // These are fake credentials in this test subprocess only. Every provider
  // request is intercepted; no Stripe payment or external email is made.
  Object.assign(process.env, {
    ORDER_EMAIL_TRANSPORT: "mailersend",
    MAILERSEND_API_TOKEN: "unit-test-not-a-provider-token",
    MAILERSEND_FROM_EMAIL: "orders@example.test",
    MAILERSEND_FROM_NAME: "Glam Too Boutique",
    MAILERSEND_REPLY_TO_EMAIL: "support@example.test",
    ORDER_EMAIL_PUBLIC_URL: "https://shop.example.test",
    ORDER_EMAIL_ALLOWED_RECIPIENTS: recipient,
    ORDER_EMAIL_SEND_TO_ALL: "false",
  });
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.origin, "https://api.mailersend.com", "Tests must not call another external service");
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.to[0].email, recipient, "Tests must never email another recipient");
      requests.push(body);
      if (sendMode === "timeout") throw new Error("Simulated unknown transport outcome");
      if (/^\d+$/.test(sendMode)) return new Response(null, { status: Number(sendMode) });
      if (sendMode === "suppressed") return new Response(null, { status: 202 });
      const messageId = `message${++counter}`;
      records.set(`email${counter}`, { to: body.to[0].email, messageId });
      return new Response(null, { status: 202, headers: { "x-message-id": messageId } });
    }
    if (target.pathname.startsWith("/v1/messages/")) {
      const messageId = target.pathname.split("/").at(-1);
      const ids = [...records].filter(([, value]) => value.messageId === messageId).map(([id]) => ({ id }));
      return Response.json({ data: { emails: ids } });
    }
    const emailId = target.pathname.split("/").at(-1)!;
    const record = records.get(emailId)!;
    return Response.json({ data: {
      id: emailId, message_id: record.messageId,
      to: mismatchedRecipient ? "another@example.test" : record.to,
      status: deliveryStatus === "bounced" ? "rejected" : deliveryStatus,
      suppression_reason: deliveryStatus === "bounced" ? "hard_bounced" : null,
      activity: [],
    } });
  };
});
beforeEach(() => {
  requests.length = 0;
  records.clear();
  sendMode = "accepted"; deliveryStatus = "sent"; mismatchedRecipient = false;
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = recipient;
});
afterEach(async () => {
  await pool.query("DELETE FROM store_orders WHERE id = ANY($1::text[])", [orders]);
  orders.length = 0;
});
after(async () => { globalThis.fetch = originalFetch; await pool.end(); });

test("missing safe routing leaves confirmations queued; refund worker cannot claim confirmation jobs", async () => {
  const id = await paid();
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "";
  assert.equal(isOrderEmailConfigured(), false);
  await processOrderConfirmations();
  await processRefundNotifications();
  assert.equal(requests.length, 0);
  assert.equal((await notification(id)).status, "pending");
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = recipient;
  await processRefundNotifications();
  assert.equal(requests.length, 0);
  assert.equal((await notification(id)).status, "pending");
});

test("template uses persisted variants, quantities, amounts and VAT without charging VAT again; links require authentication", async () => {
  const id = await paid();
  const order = (await pool.query("SELECT * FROM store_orders WHERE id = $1", [id])).rows[0];
  const items = (await pool.query("SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY id", [id])).rows;
  const message = buildOrderConfirmation(order, items, "https://shop.example.test");
  assert.match(message.subject, /Glam Too.*#GM-/);
  assert.match(message.text, /M\/L — quantity 2 × £29\.99 — £59\.98/);
  assert.match(message.text, /Subtotal: £79\.97/);
  assert.match(message.text, /Discount: -£5\.00/);
  assert.match(message.text, /Delivery: £8\.99/);
  assert.match(message.text, /VAT included \(not an additional charge\): £13\.99/);
  assert.match(message.text, /Total paid: £83\.96/);
  assert.match(message.text, /UK Saturday delivery/);
  assert.match(message.text, /1 Test Street\nTest Flat\nLondon\nSW1A 1AA\nGB/);
  assert.match(message.text, /https:\/\/shop.example.test\/account/);
  assert.ok(!message.html.includes("<Test Shopper>"));
  assert.ok(message.html.includes("&lt;Test Shopper&gt;"));
  assert.ok(!message.text.includes(`pi_test_${id}`));
});

test("registered finalization, duplicate webhooks/refresh and concurrent workers yield one accepted email, then provider-confirmed delivery", async () => {
  const id = await paid();
  await Promise.all(Array.from({ length: 5 }, () => finalizePaidOrder(id, `pi_test_${id}`)));
  assert.equal((await pool.query("SELECT count(*) FROM store_order_email_notifications WHERE order_id = $1", [id])).rows[0].count, "1");
  await Promise.all([processOrderConfirmations(), processOrderConfirmations(), processOrderConfirmations()]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].from.name, "Glam Too Boutique");
  assert.equal(requests[0].reply_to.email, "support@example.test");
  assert.equal((await notification(id)).status, "accepted");
  assert.ok((await notification(id)).provider_message_id);
  assert.equal((await notification(id)).delivered_at, null);
  await due(id);
  await refreshOrderEmailDelivery();
  assert.equal((await notification(id)).status, "accepted", "sent is not delivered");
  deliveryStatus = "delivered";
  await due(id);
  await refreshOrderEmailDelivery();
  assert.equal((await notification(id)).status, "delivered");
  assert.ok((await notification(id)).delivered_at);
  assert.ok((await notification(id)).provider_email_id);
  await finalizePaidOrder(id, `pi_test_${id}`);
  await processOrderConfirmations();
  assert.equal(requests.length, 1);
});

test("guest confirmation is queued and sent without an account, using contact rather than a public order-access link", async () => {
  const id = await paid(true);
  await processOrderConfirmations();
  assert.equal(requests.length, 1);
  assert.match(requests[0].text, /https:\/\/shop.example.test\/contact/);
  assert.ok(!requests[0].text.includes("guest_"));
  assert.ok(!requests[0].text.includes("payment_intent"));
  assert.equal((await notification(id)).status, "accepted");
});

test("temporary provider rejection backs off and recovers without changing order amounts or payment state", async () => {
  const id = await paid();
  sendMode = "503";
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "pending");
  assert.equal((await notification(id)).attempts, 1);
  await processOrderConfirmations();
  assert.equal(requests.length, 1, "Backoff prevents an immediate repeat");
  sendMode = "accepted";
  await due(id);
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "accepted");
  assert.equal((await notification(id)).attempts, 2);
  const order = (await pool.query("SELECT payment_status, total FROM store_orders WHERE id = $1", [id])).rows[0];
  assert.deepEqual(order, { payment_status: "paid", total: 8396 });
  assert.equal((await pool.query("SELECT count(*) FROM store_order_items WHERE order_id = $1", [id])).rows[0].count, "2");
});

test("transient failures have a five-attempt limit", async () => {
  const id = await paid();
  sendMode = "429";
  for (let index = 0; index < 8; index++) { await due(id); await processOrderConfirmations(); }
  assert.equal(requests.length, 5);
  assert.equal((await notification(id)).status, "failed");
  assert.ok((await notification(id)).failed_at);
});

test("permanent rejection and 202 without a message id are failures, never evidence of a sent email", async () => {
  for (const mode of ["422", "suppressed"]) {
    const id = await paid();
    sendMode = mode;
    await processOrderConfirmations();
    await processOrderConfirmations();
    assert.equal((await notification(id)).status, "failed");
    assert.equal((await notification(id)).provider_message_id, null);
    assert.equal((await notification(id)).attempts, 1);
  }
  assert.equal(requests.length, 2);
});

test("an ambiguous network outcome or expired sender lease is frozen, not blindly resent", async () => {
  const id = await paid();
  sendMode = "timeout";
  await processOrderConfirmations();
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "uncertain");
  assert.equal(requests.length, 1);
  const stale = await paid();
  await pool.query("UPDATE store_order_email_notifications SET status = 'sending', updated_at = NOW() - INTERVAL '20 minutes' WHERE order_id = $1", [stale]);
  await processOrderConfirmations();
  assert.equal((await notification(stale)).status, "uncertain");
  assert.equal(requests.length, 1);
});

test("provider bounce and rejection are persisted separately from delivery", async () => {
  for (const status of ["bounced", "rejected"]) {
    const id = await paid();
    await processOrderConfirmations();
    deliveryStatus = status;
    await due(id);
    await refreshOrderEmailDelivery();
    assert.equal((await notification(id)).status, status === "bounced" ? "bounced" : "failed");
    assert.equal((await notification(id)).delivered_at, null);
  }
});

test("delivery evidence for another recipient cannot mark this order delivered", async () => {
  const id = await paid();
  await processOrderConfirmations();
  deliveryStatus = "delivered"; mismatchedRecipient = true;
  await due(id);
  await refreshOrderEmailDelivery();
  assert.equal((await notification(id)).status, "accepted");
  assert.equal((await notification(id)).delivered_at, null);
});

test("recipient allowlist excludes other shoppers even when a provider token exists", async () => {
  const id = await paid();
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "different-test@example.test";
  await processOrderConfirmations();
  assert.equal(requests.length, 0);
  assert.equal((await notification(id)).status, "pending");
});

test("already-paid historical records never automatically receive new confirmations", async () => {
  const id = await pending();
  // Represent a pre-existing paid record without calling payment finalization.
  // Only this isolated fixture is changed, never merchant order history.
  await pool.query("UPDATE store_orders SET payment_status = 'paid', payment_reference = $2, paid_at = NOW() WHERE id = $1", [id, `pi_${id}`]);
  await finalizePaidOrder(id, `pi_${id}`);
  assert.equal(await notification(id), undefined);
  await processOrderConfirmations();
  assert.equal(requests.length, 0);
});

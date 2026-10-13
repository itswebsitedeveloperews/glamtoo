import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { pool } from "@workspace/db";
import { createPendingOrder, finalizePaidOrder } from "../src/orderService";
import { isOrderEmailConfigured, processOrderConfirmations, refreshOrderEmailDelivery } from "../src/orderConfirmationNotifications";
import { verifyGmailSmtp } from "../src/gmailSmtp";
import { resetSmtp, setSmtpFailure, setMismatchedRecipient, smtpCalls, smtpConnections } from "./fixtures/gmail-smtp";

const runId = `smtp_test_${crypto.randomUUID().replace(/-/g, "")}`;
const recipient = `${runId}@example.test`;
const orders: string[] = [];
const originalFetch = globalThis.fetch;
let externalRequests = 0;
async function paid(guest = false) {
  const order = await createPendingOrder({
    userId: `${guest ? "guest" : "user"}_${runId}`, email: recipient, customerName: "SMTP Test",
    phone: "", address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
    delivery: "Standard Delivery", subtotal: 1999, deliveryAmount: 395, discountAmount: 0, total: 2394, vatAmount: 399,
    expiresAt: new Date(Date.now() + 60_000),
    items: [{ productId: runId, name: "Mini Tote Bag", quantity: 1, unitAmount: 1999, total: 1999 }],
  });
  orders.push(order.id);
  await finalizePaidOrder(order.id, `pi_test_${order.id}`);
  return order.id;
}
async function notification(id: string) {
  return (await pool.query("SELECT * FROM store_order_email_notifications WHERE order_id = $1", [id])).rows[0];
}
async function due(id: string) {
  await pool.query("UPDATE store_order_email_notifications SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE order_id = $1", [id]);
}
before(() => {
  // Bundled SMTP transport is replaced with the fixture. No external SMTP,
  // Gmail API, MailerSend request or Stripe payment is made by these tests.
  Object.assign(process.env, {
    GMAIL_SMTP_AUTH_MODE: "app_password",
    GMAIL_SMTP_USER: "orders@example.test", GMAIL_SMTP_APP_PASSWORD: "fake test only pass",
    GMAIL_SMTP_REPLY_TO_EMAIL: "support@example.test",
    ORDER_EMAIL_PUBLIC_URL: "https://shop.example.test",
    ORDER_EMAIL_ALLOWED_RECIPIENTS: recipient, ORDER_EMAIL_SEND_TO_ALL: "false",
    MAILERSEND_API_TOKEN: "fake-old-token", MAILERSEND_FROM_EMAIL: "old@example.test",
  });
  delete process.env.ORDER_EMAIL_TRANSPORT; // Gmail is the default, never a fallback to MailerSend.
  globalThis.fetch = async () => { externalRequests++; throw new Error("External requests forbidden in SMTP tests"); };
});
beforeEach(() => {
  resetSmtp(); externalRequests = 0;
  process.env.GMAIL_SMTP_APP_PASSWORD = "fake test only pass";
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = recipient;
});
afterEach(async () => {
  await pool.query("DELETE FROM store_orders WHERE id = ANY($1::text[])", [orders]);
  orders.length = 0;
  assert.equal(externalRequests, 0, "SMTP messages must not be queried through MailerSend");
});
after(async () => { globalThis.fetch = originalFetch; await pool.end(); });

test("Gmail is default; missing credentials or safe recipients cannot fall back to MailerSend", async () => {
  const id = await paid();
  delete process.env.GMAIL_SMTP_APP_PASSWORD;
  assert.equal(await isOrderEmailConfigured(), false);
  await processOrderConfirmations();
  process.env.GMAIL_SMTP_APP_PASSWORD = "fake-test-only";
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "";
  assert.equal(await isOrderEmailConfigured(), false);
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
  assert.equal((await notification(id)).status, "pending");
});

test("registered/guest confirmations use authenticated sender, TLS, saved totals and exactly one SMTP attempt", async () => {
  for (const guest of [false, true]) {
    const id = await paid(guest);
    await Promise.all([processOrderConfirmations(), processOrderConfirmations()]);
    await finalizePaidOrder(id, `pi_test_${id}`);
    await processOrderConfirmations();
    const message = smtpCalls.at(-1);
    assert.equal(message.to, recipient);
    assert.equal(message.from.address, "orders@example.test");
    assert.equal(message.from.name, "Glam Too Boutique");
    assert.equal(message.replyTo, "support@example.test");
    assert.deepEqual(message.envelope, { from: "orders@example.test", to: [recipient] });
    assert.match(message.text, /Total paid: £23\.94/);
    assert.match(message.text, guest ? /\/contact/ : /\/account/);
    const row = await notification(id);
    assert.equal(row.provider, "gmail_smtp");
    assert.equal(row.status, "accepted");
    assert.equal(row.provider_message_id, message.messageId);
    assert.equal(row.delivered_at, null);
    await due(id);
    await refreshOrderEmailDelivery();
    assert.equal((await notification(id)).status, "accepted", "SMTP acceptance is not inbox delivery");
  }
  assert.equal(smtpCalls.length, 2);
  for (const connection of smtpConnections) {
    assert.equal(connection.options.host, "smtp.gmail.com");
    assert.equal(connection.options.port, 465);
    assert.equal(connection.options.secure, true);
    assert.equal(connection.options.tls.rejectUnauthorized, true);
    assert.equal(connection.options.debug, false);
    assert.equal(connection.closed, true);
  }
});

test("temporary SMTP rejection backs off, then succeeds without changing the paid order", async () => {
  const id = await paid();
  setSmtpFailure({ responseCode: 421, code: "EENVELOPE", command: "RCPT TO" });
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "pending");
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 1);
  await due(id); setSmtpFailure(null);
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "accepted");
  assert.equal((await notification(id)).attempts, 2);
  assert.ok(!String((await notification(id)).last_error).includes(recipient));
  assert.deepEqual((await pool.query("SELECT payment_status, total FROM store_orders WHERE id=$1", [id])).rows[0], { payment_status: "paid", total: 2394 });
});

test("DNS, refused connection and setup timeouts retry at most five times", async () => {
  const failures = [
    { code: "EDNS", command: "CONN" },
    { code: "ESOCKET", originalCode: "ECONNREFUSED", command: "CONN" },
    { code: "ETIMEDOUT", timeoutType: "CONNECT_TIMEOUT", command: "CONN" },
    { code: "ETIMEDOUT", timeoutType: "GREETING_TIMEOUT", command: "CONN" },
  ];
  for (const failure of failures) {
    const id = await paid();
    setSmtpFailure(failure);
    for (let attempt = 0; attempt < 7; attempt++) { await due(id); await processOrderConfirmations(); }
    assert.equal((await notification(id)).status, "failed");
    assert.equal((await notification(id)).attempts, 5);
  }
  assert.equal(smtpCalls.length, 5 * failures.length);
});

test("authentication failure and permanent recipient rejection fail without automatic resends or leaked errors", async () => {
  for (const failure of [{ code: "EAUTH", responseCode: 535 }, { code: "EENVELOPE", responseCode: 550 }]) {
    const id = await paid();
    setSmtpFailure(failure);
    await processOrderConfirmations(); await processOrderConfirmations();
    const row = await notification(id);
    assert.equal(row.status, "failed");
    assert.equal(row.attempts, 1);
    assert.ok(!row.last_error.includes("private recipient data"));
  }
  assert.equal(smtpCalls.length, 2);
});

test("DATA disconnects and ambiguously labelled CONN socket errors must not cause duplicate email", async () => {
  const failures = [
    { code: "ETIMEDOUT", command: "DATA" },
    { code: "ESOCKET", originalCode: "ECONNRESET", command: "CONN" },
    { code: "ETIMEDOUT", timeoutType: "SOCKET_TIMEOUT", command: "CONN" },
    { code: "ECONNECTION", command: "CONN" },
  ];
  for (const failure of failures) {
    const id = await paid();
    setSmtpFailure(failure);
    await processOrderConfirmations(); await due(id); await processOrderConfirmations();
    assert.equal((await notification(id)).status, "uncertain");
    assert.match((await notification(id)).provider_message_id, /glam-too-order-.*@example\.test/);
  }
  assert.equal(smtpCalls.length, failures.length);
});

test("mismatched SMTP acceptance cannot be recorded as accepted or delivered", async () => {
  const id = await paid();
  setMismatchedRecipient();
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "uncertain");
  assert.equal((await notification(id)).delivered_at, null);
});

test("recipient allowlist prevents SMTP sending to other shoppers", async () => {
  const id = await paid();
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "another@example.test";
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
  assert.equal((await notification(id)).status, "pending");
});

test("credential verification sends no message and sanitizes credential errors", async () => {
  assert.equal(await verifyGmailSmtp(), true);
  setSmtpFailure({ code: "EAUTH" });
  await assert.rejects(verifyGmailSmtp, /verification failed/);
  assert.equal(smtpCalls.length, 0);
  assert.ok(smtpConnections.every((connection) => connection.closed));
});

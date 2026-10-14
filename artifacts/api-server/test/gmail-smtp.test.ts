import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { pool } from "@workspace/db";
import { gmailOAuthClient, saveGmailRefreshToken } from "../src/gmailOAuthCredentials";
import { createPendingOrder, finalizePaidOrder } from "../src/orderService";
import { isOrderEmailConfigured, processOrderConfirmations, refreshOrderEmailDelivery } from "../src/orderConfirmationNotifications";
import { verifyGmailSmtp } from "../src/gmailSmtp";
import { approveCustomerEmailRetry } from "../src/customerEmailRetry";
import { resetSmtp, setSmtpFailure, setMismatchedRecipient, smtpCalls, smtpConnections } from "./fixtures/gmail-smtp";

const runId = `smtp_test_${crypto.randomUUID().replace(/-/g, "")}`;
const recipient = `${runId}@example.test`;
const orders: string[] = [];
const originalFetch = globalThis.fetch;
let externalRequests = 0;
async function paid(guest = false, email = recipient) {
  const order = await createPendingOrder({
    userId: `${guest ? "guest" : "user"}_${runId}`, email, customerName: "SMTP Test",
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
  return (await pool.query("SELECT * FROM store_order_email_notifications WHERE order_id = $1 AND notification_type='order_confirmation'", [id])).rows[0];
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
  process.env.GMAIL_SMTP_AUTH_MODE = "app_password";
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = recipient;
  delete process.env.ORDER_CONFIRMATION_SEND_TO_ALL;
  delete process.env.ORDER_CONFIRMATION_ENABLED_SINCE;
  delete process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS;
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

test("customer rollout sends new paid confirmations outside the test list exactly once", async () => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "other-test@example.test";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = new Date(Date.now() - 1000).toISOString();
  const id = await paid();
  await processOrderConfirmations();
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "accepted");
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, recipient);
  assert.equal(smtpCalls[0].attachments[0].cid, "glam-too-order-wordmark");
  assert.ok(Buffer.isBuffer(smtpCalls[0].attachments[0].content));
});

test("customer rollout leaves older unapproved confirmations pending with zero attempts", async () => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "other-test@example.test";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = new Date(Date.now() - 1000).toISOString();
  const id = await paid();
  await pool.query("UPDATE store_order_email_notifications SET created_at=NOW()-INTERVAL '1 day' WHERE order_id=$1", [id]);
  await processOrderConfirmations();
  assert.equal((await notification(id)).status, "pending");
  assert.equal((await notification(id)).attempts, 0);
  assert.equal(smtpCalls.length, 0);
});

test("two distinct customers receive only their own saved paid-order confirmation", async () => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = new Date(Date.now() - 1000).toISOString();
  const second = `second_${runId}@example.test`;
  const firstId = await paid(false, recipient);
  const secondId = await paid(true, second);
  // A stale/custom notification recipient must never override the paid order.
  await pool.query("UPDATE store_order_email_notifications SET recipient_email='wrong@example.test' WHERE order_id=ANY($1::text[])", [[firstId, secondId]]);
  await processOrderConfirmations();
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 2);
  const firstMail = smtpCalls.find(mail => mail.to === recipient);
  const secondMail = smtpCalls.find(mail => mail.to === second);
  assert.ok(firstMail); assert.ok(secondMail);
  const firstReference = firstId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  const secondReference = secondId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  assert.ok(firstMail.html.includes(firstReference));
  assert.ok(!firstMail.html.includes(secondReference));
  assert.ok(secondMail.html.includes(secondReference));
  assert.ok(!secondMail.html.includes(firstReference));
  assert.ok(firstMail.html.includes("£23.94"));
  assert.ok(secondMail.html.includes("£23.94"));
  assert.ok(smtpCalls.every(mail => mail.to === mail.envelope.to[0]));
});

test("one historical approval is idempotent and cannot resend an accepted confirmation", async () => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = new Date(Date.now() - 1000).toISOString();
  const id = await paid();
  await pool.query("UPDATE store_order_email_notifications SET created_at=NOW()-INTERVAL '1 day' WHERE order_id=$1", [id]);
  await pool.query(
    `INSERT INTO store_order_email_notifications (order_id,notification_type,recipient_email,status,attempts,provider_message_id)
     VALUES ($1,'admin_order_confirmation:already-accepted','staff@example.test','accepted',1,'existing-admin-message')`, [id],
  );
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
  const approvals = await Promise.all([
    approveCustomerEmailRetry(`pi_test_${id}`, "approved_test_admin"),
    approveCustomerEmailRetry(`pi_test_${id}`, "approved_test_admin"),
  ]);
  assert.deepEqual(approvals.map(value => value.outcome).sort(), ["already_approved", "approved"]);
  assert.ok((await notification(id)).customer_retry_approved_at);
  assert.equal((await notification(id)).attempts, 0);
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 1);
  assert.equal((await notification(id)).status, "accepted");
  assert.equal((await approveCustomerEmailRetry(`pi_test_${id}`, "approved_test_admin")).outcome, "already_processed");
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 1);
  const adminCopy = (await pool.query("SELECT status,attempts,provider_message_id FROM store_order_email_notifications WHERE order_id=$1 AND notification_type LIKE 'admin_order_confirmation:%'", [id])).rows[0];
  assert.deepEqual(adminCopy, { status: "accepted", attempts: 1, provider_message_id: "existing-admin-message" });
});

test("controlled approval cannot bypass payment, staging restrictions or uncertain attempts", async () => {
  const id = await paid();
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "false";
  process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS = "another@example.test";
  await assert.rejects(approveCustomerEmailRetry(`pi_test_${id}`, "admin"), /staging recipient policy/);
  process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS = recipient;
  await pool.query("UPDATE store_orders SET payment_status='cancelled' WHERE id=$1", [id]);
  await assert.rejects(approveCustomerEmailRetry(`pi_test_${id}`, "admin"), /confirmed paid order/);
  await pool.query("UPDATE store_orders SET payment_status='paid' WHERE id=$1", [id]);
  for (const status of ["sending", "uncertain", "failed", "bounced"]) {
    await pool.query("UPDATE store_order_email_notifications SET status=$2 WHERE order_id=$1", [id, status]);
    await assert.rejects(approveCustomerEmailRetry(`pi_test_${id}`, "admin"), /reconciled/);
  }
  await pool.query("UPDATE store_order_email_notifications SET status='pending',attempts=1 WHERE order_id=$1", [id]);
  await assert.rejects(approveCustomerEmailRetry(`pi_test_${id}`, "admin"), /reconciled/);
  assert.equal(smtpCalls.length, 0);
});

test("an invalid customer activation date cannot interrupt independently enabled admin copies", async () => {
  await pool.query(`INSERT INTO store_contact_notification_settings (id,order_enabled,order_admin_emails,updated_by)
    VALUES (1,true,ARRAY['staff@example.test'],'fixture')
    ON CONFLICT (id) DO UPDATE SET order_enabled=true,order_admin_emails=EXCLUDED.order_admin_emails`);
  try {
    const id = await paid();
    process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
    process.env.ORDER_CONFIRMATION_ENABLED_SINCE = "invalid";
    await processOrderConfirmations();
    assert.equal(smtpCalls.length, 1);
    assert.equal(smtpCalls[0].to, "staff@example.test");
    assert.equal((await notification(id)).attempts, 0);
  } finally {
    await pool.query("DELETE FROM store_contact_notification_settings WHERE id=1");
  }
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

test("OAuth activation cutoff retains pre-authorization confirmations but sends a fresh eligible order", async () => {
  const old = await paid();
  await pool.query("UPDATE store_order_email_notifications SET created_at=NOW()-INTERVAL '1 hour' WHERE order_id=$1", [old]);
  Object.assign(process.env, {
    GMAIL_SMTP_AUTH_MODE: "oauth2", GMAIL_SMTP_CLIENT_ID: "isolated-client",
    GMAIL_SMTP_CLIENT_SECRET: "isolated-client-secret", SESSION_SECRET: "isolated-encryption-secret",
    GMAIL_SMTP_OAUTH_REDIRECT_URI: "https://shop.example.test/api/gmail/oauth/callback",
  });
  try {
    await saveGmailRefreshToken(gmailOAuthClient()!, "isolated-refresh-token", "isolated-admin");
    await processOrderConfirmations();
    assert.equal((await notification(old)).status, "pending");
    assert.equal((await notification(old)).attempts, 0);
    assert.equal(smtpCalls.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const fresh = await paid();
    await processOrderConfirmations();
    assert.equal((await notification(fresh)).status, "accepted");
    assert.equal((await notification(fresh)).delivered_at, null);
    assert.equal((await notification(old)).attempts, 0);
    assert.equal(smtpCalls.length, 1);
  } finally {
    await pool.query("DELETE FROM store_gmail_oauth_credentials WHERE id=1");
    for (const key of ["GMAIL_SMTP_CLIENT_ID", "GMAIL_SMTP_CLIENT_SECRET", "SESSION_SECRET", "GMAIL_SMTP_OAUTH_REDIRECT_URI"]) delete process.env[key];
    process.env.GMAIL_SMTP_AUTH_MODE = "app_password";
  }
});

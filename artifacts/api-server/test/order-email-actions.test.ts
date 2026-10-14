import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { pool } from "@workspace/db";
import router from "../src/routes/orderEmailActions";
import { getOrderEmailStatus } from "../src/orderEmailStatus";
import { createPendingOrder, finalizePaidOrder } from "../src/orderService";
import { processOrderConfirmations } from "../src/orderConfirmationNotifications";
import { resetSmtp, setRecipientFailure, setSmtpFailure, smtpCalls } from "./fixtures/gmail-smtp";

let server: Server;
let origin: string;
const recipients = ["first@example.test", "second@example.test"];
const input = { action: "admin_copy", confirmed: true, recipients };
const ids: string[] = [];
before(async () => {
  Object.assign(process.env, {
    GMAIL_SMTP_AUTH_MODE: "app_password", GMAIL_SMTP_USER: "sender@example.test",
    GMAIL_SMTP_APP_PASSWORD: "fake-test-only-password", ORDER_EMAIL_TRANSPORT: "gmail_smtp",
    ORDER_EMAIL_SEND_TO_ALL: "false", ORDER_EMAIL_ALLOWED_RECIPIENTS: "allowed@example.test",
    ORDER_EMAIL_PUBLIC_URL: "https://shop.example.test",
  });
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(async () => {
  resetSmtp();
  if (ids.length) await pool.query("DELETE FROM store_orders WHERE id=ANY($1::text[])", [ids.splice(0)]);
  await pool.query("DELETE FROM store_contact_notification_settings");
  await pool.query(`INSERT INTO store_contact_notification_settings (id, order_enabled, order_admin_emails, fallback_admin_email, updated_by)
    VALUES (1, false, $1, 'fallback@example.test', 'oauth-admin')`, [recipients]);
});
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (ids.length) await pool.query("DELETE FROM store_orders WHERE id=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM store_contact_notification_settings");
  await pool.end();
});
async function order(paid = true, email = "restricted@example.test") {
  const result = await createPendingOrder({
    userId: "guest_isolated_email_actions", email, customerName: "Test", phone: "",
    address: { line1: "1 Test", line2: "", city: "London", postcode: "SW1A 1AA", country: "GB" },
    delivery: "Test shipping", subtotal: 1000, deliveryAmount: 0, discountAmount: 0, total: 1000, vatAmount: 167,
    expiresAt: new Date(Date.now() + 60_000),
    items: [{ productId: "test", name: "Test product", quantity: 1, unitAmount: 1000, total: 1000 }],
  });
  ids.push(result.id);
  if (paid) await finalizePaidOrder(result.id, `pi_test_${result.id}`);
  await pool.query("UPDATE store_contact_notification_settings SET order_enabled=true WHERE id=1");
  return result.id;
}
async function post(id: string, body: unknown = input, user = "oauth-admin") {
  return fetch(`${origin}/api/admin/orders/${id}/email-actions`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-user": user }, body: JSON.stringify(body),
  });
}
async function jobs(id: string) {
  return (await pool.query("SELECT * FROM store_order_email_notifications WHERE order_id=$1 ORDER BY id", [id])).rows;
}
test("anonymous, customer and malformed approvals cannot queue emails", async () => {
  const id = await order();
  assert.equal((await post(id, input, "")).status, 401);
  assert.equal((await post(id, input, "customer")).status, 403);
  for (const body of [
    { ...input, confirmed: false }, { ...input, confirmed: undefined },
    { ...input, recipients: [] }, { ...input, recipients: ["bad"] },
    { ...input, action: "retry" }, { ...input, notificationId: 1 }, { ...input, extra: "unsafe" },
  ]) assert.equal((await post(id, body)).status, 400);
  assert.equal((await post("not-an-order")).status, 404);
  assert.equal(smtpCalls.length, 0);
});
test("status reads do not send or backfill; exact approval queues one job per snapshotted admin", async () => {
  const id = await order();
  const beforeStatus = await getOrderEmailStatus(id);
  assert.equal(beforeStatus!.adminCopyAction.blockReason, null);
  assert.equal((await jobs(id)).filter(n => n.recipient_email).length, 0);
  assert.equal((await post(id, { ...input, recipients: ["attacker@example.test"] })).status, 409);
  assert.equal((await post(id)).status, 202);
  assert.equal(smtpCalls.length, 0, "Request must not call SMTP");
  const rows = (await jobs(id)).filter(n => n.recipient_email);
  assert.deepEqual(rows.map(n => n.recipient_email), recipients);
  assert.ok(rows.every(n => n.manual_requested_by === "oauth-admin" && n.manual_requested_at));
  assert.equal((await post(id)).status, 409);
  await processOrderConfirmations();
  assert.deepEqual(smtpCalls.map(n => n.to).sort(), recipients);
  assert.equal((await jobs(id)).find(n => !n.recipient_email).status, "pending", "Customer restrictions stay enforced");
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 2);
});
test("concurrent creation requests allow exactly one approval", async () => {
  const id = await order();
  const statuses = await Promise.all(Array.from({ length: 5 }, async () => (await post(id)).status));
  assert.equal(statuses.filter(n => n === 202).length, 1);
  assert.ok(statuses.every(n => n === 202 || n === 409));
  assert.equal((await jobs(id)).filter(n => n.recipient_email).length, 2);
});
test("unpaid, refunded and unresolved orders reject manual sends", async () => {
  const id = await order(false);
  assert.equal((await post(id)).status, 409);
  await pool.query("UPDATE store_orders SET payment_status='paid', payment_resolution='refunded' WHERE id=$1", [id]);
  assert.equal((await post(id)).status, 409);
  await pool.query("UPDATE store_orders SET payment_status='paid', payment_resolution='refund_required' WHERE id=$1", [id]);
  assert.equal((await post(id)).status, 409);
});
test("changed or disabled settings invalidate approval without backfilling new recipients", async () => {
  const id = await order();
  await pool.query("UPDATE store_contact_notification_settings SET order_admin_emails=$1 WHERE id=1", [["new@example.test"]]);
  assert.equal((await post(id)).status, 409);
  await pool.query("UPDATE store_contact_notification_settings SET order_enabled=false WHERE id=1");
  assert.equal((await post(id, { ...input, recipients: ["new@example.test"] })).status, 409);
  assert.equal((await jobs(id)).filter(n => n.recipient_email).length, 0);
});
test("one recipient's definitive failure can retry once without duplicating accepted copies or changing Message-ID", async () => {
  const id = await order();
  await post(id);
  setRecipientFailure(recipients[1], { code: "EAUTH" });
  await processOrderConfirmations();
  const rows = await jobs(id);
  const failed = rows.find(n => n.status === "failed");
  assert.equal(failed.retry_safe, 1);
  assert.ok(failed.provider_message_id);
  const retry = { action: "retry", confirmed: true, notificationId: failed.id, recipients: [recipients[1]] };
  const statuses = await Promise.all([post(id, retry), post(id, retry)]);
  assert.deepEqual(statuses.map(r => r.status).sort(), [202, 409]);
  assert.equal((await jobs(id)).find(n => n.id === failed.id).attempts, 1, "Do not erase attempt history");
  resetSmtp();
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, recipients[1]);
  assert.equal(smtpCalls[0].messageId, failed.provider_message_id);
  assert.equal((await post(id, retry)).status, 409);
});
test("accepted, delivered, uncertain and legacy failures cannot retry, even if status later says failed", async () => {
  const id = await order();
  await post(id);
  setSmtpFailure({ code: "ESOCKET" });
  await processOrderConfirmations();
  const row = (await jobs(id)).find(n => n.recipient_email);
  const body = { action: "retry", confirmed: true, notificationId: row.id, recipients: [row.recipient_email] };
  assert.equal((await post(id, body)).status, 409);
  for (const status of ["accepted", "delivered", "sending", "pending", "bounced", "failed"]) {
    await pool.query("UPDATE store_order_email_notifications SET status=$2, retry_safe=0 WHERE id=$1", [row.id, status]);
    assert.equal((await post(id, body)).status, 409);
  }
  await pool.query("UPDATE store_order_email_notifications SET retry_safe=1, accepted_at=NOW() WHERE id=$1", [row.id]);
  assert.equal((await post(id, body)).status, 409);
});
test("customer retries preserve restrictions, payment eligibility and original job ownership", async () => {
  const id = await order();
  const row = (await jobs(id)).find(n => !n.recipient_email);
  await pool.query("UPDATE store_order_email_notifications SET status='failed', provider='gmail_smtp', retry_safe=1 WHERE id=$1", [row.id]);
  const body = { action: "retry", confirmed: true, notificationId: row.id, recipients: ["restricted@example.test"] };
  assert.equal((await post(id, body)).status, 409);
  const other = await order();
  assert.equal((await post(other, body)).status, 409);
});
test("approved customer retry targets only its original notification and still stops on refund", async () => {
  const id = await order(true, "allowed@example.test");
  setSmtpFailure({ code: "EAUTH" });
  await processOrderConfirmations();
  const row = (await jobs(id)).find(n => !n.recipient_email);
  const body = { action: "retry", confirmed: true, notificationId: row.id, recipients: ["allowed@example.test"] };
  await pool.query("UPDATE store_orders SET payment_resolution='refunded' WHERE id=$1", [id]);
  assert.equal((await post(id, body)).status, 409);
  await pool.query("UPDATE store_orders SET payment_resolution='none' WHERE id=$1", [id]);
  assert.equal((await post(id, body)).status, 202);
  resetSmtp();
  await processOrderConfirmations();
  assert.deepEqual(smtpCalls.map(n => n.to), ["allowed@example.test"]);
});
test("saved admin failures cannot retry to a removed or newly supplied recipient", async () => {
  const id = await order();
  await post(id);
  setSmtpFailure({ code: "EAUTH" });
  await processOrderConfirmations();
  const row = (await jobs(id)).find(n => n.recipient_email);
  const body = { action: "retry", confirmed: true, notificationId: row.id, recipients: [row.recipient_email] };
  assert.equal((await post(id, { ...body, recipients: ["new@example.test"] })).status, 409);
  await pool.query("UPDATE store_contact_notification_settings SET order_admin_emails=$1 WHERE id=1", [["new@example.test"]]);
  assert.equal((await post(id, body)).status, 409);
  assert.equal((await post(id, { ...input, recipients: ["new@example.test"] })).status, 409);
});
test("blank recipient lists require approval of the saved fallback admin address", async () => {
  const id = await order();
  await pool.query("UPDATE store_contact_notification_settings SET order_admin_emails='{}' WHERE id=1");
  assert.equal((await post(id)).status, 409);
  assert.equal((await post(id, { ...input, recipients: ["fallback@example.test"] })).status, 202);
  assert.deepEqual((await jobs(id)).filter(n => n.recipient_email).map(n => n.recipient_email), ["fallback@example.test"]);
});
test("exhausted definitive temporary failures get only one additional attempt", async () => {
  const id = await order();
  await post(id);
  const row = (await jobs(id)).find(n => n.recipient_email);
  await pool.query("UPDATE store_order_email_notifications SET attempts=4 WHERE id=$1", [row.id]);
  setSmtpFailure({ responseCode: 451 });
  await processOrderConfirmations();
  assert.equal((await jobs(id)).find(n => n.id === row.id).status, "failed");
  const body = { action: "retry", confirmed: true, notificationId: row.id, recipients: [row.recipient_email] };
  assert.equal((await post(id, body)).status, 202);
  await processOrderConfirmations();
  const final = (await jobs(id)).find(n => n.id === row.id);
  assert.equal(final.attempts, 6);
  assert.equal(final.status, "failed");
  assert.equal((await post(id, body)).status, 409);
});

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { pool } from "@workspace/db";
import contactRouter from "../src/routes/contact";
import settingsRouter from "../src/routes/contactSettings";
import adminRouter from "../src/routes/admin";
import { resetSmtp, smtpCalls, setSmtpFailure, setRecipientFailure, holdSmtp } from "./fixtures/gmail-smtp";
import { processContactNotifications, startContactNotificationWorker } from "../src/contactNotifications";
import { createPendingOrder, finalizePaidOrder } from "../src/orderService";
import { processOrderConfirmations } from "../src/orderConfirmationNotifications";

let server: Server;
let origin: string;
let ipCounter = 0;
let processOnSubmit = true;
let activeWork = Promise.resolve();
const testOrders: string[] = [];
const adminEmail = "admin-contact@example.test";
const customerEmail = "enquirer@example.test";
before(async () => {
  Object.assign(process.env, {
    GMAIL_SMTP_AUTH_MODE: "app_password", GMAIL_SMTP_USER: "sender@example.test",
    GMAIL_SMTP_APP_PASSWORD: "fake-test-only-password", ORDER_EMAIL_SEND_TO_ALL: "false",
    ORDER_EMAIL_ALLOWED_RECIPIENTS: "different-order-test@example.test",
    ORDER_EMAIL_PUBLIC_URL: "https://shop.example.test",
  });
  delete process.env.ADMIN_EMAILS;
  const app = express(); app.set("trust proxy", 1); app.use(express.json());
  app.use("/api", settingsRouter, contactRouter, adminRouter);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(async () => {
  await activeWork;
  processOnSubmit = true;
  resetSmtp();
  if (testOrders.length) await pool.query("DELETE FROM store_orders WHERE id = ANY($1::text[])", [testOrders.splice(0)]);
  await pool.query("DELETE FROM contact_enquiries");
  await pool.query("DELETE FROM store_contact_notification_settings");
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
async function request(path: string, method = "GET", body?: unknown, user = "oauth-admin") {
  return fetch(`${origin}/api${path}`, {
    method, headers: { "Content-Type": "application/json", "x-test-user": user, "x-forwarded-for": `127.0.0.${++ipCounter}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function configure(adminEmailValue = adminEmail, enabled = true) {
  const result = await request("/admin/contact-notification-settings", "PUT", { adminEmail: adminEmailValue, enabled });
  assert.equal(result.status, 200);
}
async function submit(name = "Contact test", message = "A complete contact message for the admin inbox.") {
  const result = await request("/contact-enquiries", "POST", {
    name, email: customerEmail, topic: "Something else", order: "TEST-123", message,
  }, "");
  assert.equal(result.status, 200);
  assert.equal((await result.json()).sent, true);
  const row = (await pool.query("SELECT * FROM contact_enquiries ORDER BY id DESC LIMIT 1")).rows[0];
  if (processOnSubmit) activeWork = processContactNotifications();
  return row;
}
async function waitForStatus(id: number, status: string) {
  for (let i = 0; i < 100; i++) {
    const row = (await pool.query("SELECT * FROM contact_enquiries WHERE id = $1", [id])).rows[0];
    if (row?.delivery_status === status) return row;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Contact status did not reach ${status}.`);
}
test("contact inbox and recipient settings reject anonymous users and customers", async () => {
  for (const path of ["/admin/contact-enquiries", "/admin/contact-notification-settings"]) {
    assert.equal((await request(path, "GET", undefined, "")).status, 401);
    assert.equal((await request(path, "GET", undefined, "customer")).status, 403);
  }
  assert.equal((await request("/admin/contact-notification-settings", "PUT", { adminEmail, enabled: true }, "")).status, 401);
  assert.equal((await request("/admin/contact-notification-settings", "PUT", { adminEmail, enabled: true }, "customer")).status, 403);
});
test("admin recipient can be saved, changed, disabled and cleared without altering order policy", async () => {
  await configure(" ADMIN-CONTACT@EXAMPLE.TEST ");
  const saved = await (await request("/admin/contact-notification-settings")).json();
  assert.equal(saved.adminEmail, adminEmail); assert.equal(saved.enabled, true);
  await configure("other-admin@example.test");
  assert.equal((await (await request("/admin/contact-notification-settings")).json()).adminEmail, "other-admin@example.test");
  await configure("", false);
  assert.equal((await (await request("/admin/contact-notification-settings")).json()).enabled, false);
  assert.equal(process.env.ORDER_EMAIL_SEND_TO_ALL, "false");
  assert.equal(smtpCalls.length, 0);
});
test("invalid recipient and unknown settings fields are rejected", async () => {
  for (const body of [{ adminEmails: ["bad-address"], enabled: true }, { adminEmail: "bad-address", enabled: true },
    { adminEmail, enabled: true, role: "admin" }, { adminEmails: Array(21).fill(adminEmail) }]) {
    assert.equal((await request("/admin/contact-notification-settings", "PUT", body)).status, 400);
  }
  assert.equal((await pool.query("SELECT COUNT(*) FROM store_contact_notification_settings")).rows[0].count, "0");
});
test("disabled notifications still save full customer data and expose it only in admin inbox", async () => {
  const row = await submit();
  await waitForStatus(row.id, "not_configured");
  const inbox = await (await request("/admin/contact-enquiries")).json();
  assert.equal(inbox.enquiries[0].email, customerEmail);
  assert.equal(inbox.enquiries[0].orderNumber, "TEST-123");
  assert.equal(inbox.enquiries[0].message, row.message);
  assert.equal(smtpCalls.length, 0);
});
test("Gmail alerts go only to configured admin, use customer Reply-To and escape HTML", async () => {
  await configure();
  const row = await submit("<b>Contact test</b>", "Full message\n<script>alert('test')</script>");
  const stored = await waitForStatus(row.id, "accepted");
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, adminEmail);
  assert.equal(smtpCalls[0].replyTo, customerEmail);
  assert.equal(smtpCalls[0].from.address, "sender@example.test");
  assert.equal(smtpCalls[0].html.includes("<script>"), false);
  assert.match(smtpCalls[0].html, /&lt;script&gt;/);
  assert.match(smtpCalls[0].html, /src="cid:glam-too-contact-wordmark"/);
  assert.equal(smtpCalls[0].attachments[0].contentType, "image/png");
  assert.equal(smtpCalls[0].attachments[0].cid, "glam-too-contact-wordmark");
  assert.match(stored.email_message_id, /glam-too-contact-/);
  assert.equal(stored.delivered_at, null);
});
test("SMTP failure does not fail or lose the customer submission", async () => {
  await configure(); setSmtpFailure({ code: "EAUTH", responseCode: 535 });
  const row = await submit();
  const stored = await waitForStatus(row.id, "failed");
  assert.equal(stored.message, row.message);
  assert.equal(stored.delivery_error.includes("private recipient data"), false);
  assert.equal(smtpCalls.length, 1);
});
test("ambiguous SMTP outcomes are retained without automatic duplicate sends", async () => {
  await configure(); setSmtpFailure({ code: "ESOCKET" });
  const row = await submit();
  const stored = await waitForStatus(row.id, "uncertain");
  assert.ok(stored.email_message_id);
  await processContactNotifications();
  await processContactNotifications();
  await request("/admin/contact-enquiries"); await request("/admin/contact-enquiries");
  assert.equal(smtpCalls.length, 1);
});
test("customer receives success before SMTP finishes", async () => {
  await configure();
  let release = () => {};
  holdSmtp(new Promise<void>(resolve => { release = resolve; }));
  try {
    const row = await submit();
    await waitForStatus(row.id, "sending");
    release();
    await waitForStatus(row.id, "accepted");
  } finally { release(); }
});
test("saving or changing recipient never resends historical enquiries", async () => {
  const old = await submit();
  await waitForStatus(old.id, "not_configured");
  await configure("new-admin@example.test");
  await request("/admin/contact-enquiries");
  assert.equal(smtpCalls.length, 0);
  const fresh = await submit();
  await waitForStatus(fresh.id, "accepted");
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, "new-admin@example.test");
  assert.equal((await pool.query("SELECT delivery_status FROM contact_enquiries WHERE id=$1", [old.id])).rows[0].delivery_status, "not_configured");
});
test("persistence failure returns an error, never a false successful submission", async () => {
  await pool.query("ALTER TABLE contact_enquiries ADD CONSTRAINT isolated_contact_failure CHECK (name <> 'Force storage failure')");
  try {
    const result = await request("/contact-enquiries", "POST", {
      name: "Force storage failure", email: customerEmail, topic: "Something else", message: "This must not return success.",
    }, "");
    assert.equal(result.status, 503);
    assert.equal((await pool.query("SELECT COUNT(*) FROM contact_enquiries")).rows[0].count, "0");
    assert.equal(smtpCalls.length, 0);
  } finally { await pool.query("ALTER TABLE contact_enquiries DROP CONSTRAINT isolated_contact_failure"); }
});

async function due() {
  await pool.query("UPDATE contact_notification_jobs SET next_attempt_at=NOW()-INTERVAL '1 second' WHERE status='pending'");
}
async function jobFor(id: number) {
  return (await pool.query("SELECT * FROM contact_notification_jobs WHERE enquiry_id=$1", [id])).rows[0];
}
test("a restarted worker sends a committed job with the original recipient and Message-ID", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  const original = await jobFor(row.id);
  assert.equal(original.status, "pending");
  assert.equal(smtpCalls.length, 0);
  await configure("replacement@example.test");
  const stop = startContactNotificationWorker();
  try { await waitForStatus(row.id, "accepted"); } finally { stop(); }
  const stopAgain = startContactNotificationWorker();
  try { await processContactNotifications(); } finally { stopAgain(); }
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, adminEmail);
  assert.equal(smtpCalls[0].messageId, original.message_id);
});
test("parallel and repeated claims send only once while SMTP is in flight", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  let release = () => {};
  holdSmtp(new Promise<void>(resolve => { release = resolve; }));
  const first = processContactNotifications();
  try {
    await waitForStatus(row.id, "sending");
    await Promise.all(Array.from({ length: 8 }, () => processContactNotifications()));
    assert.equal(smtpCalls.length, 1);
  } finally { release(); await first; }
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).attempts, 1);
  assert.equal(smtpCalls.length, 1);
});
test("expired pre-send leases recover, but expired sending leases freeze without resending", async () => {
  processOnSubmit = false;
  await configure();
  const safe = await submit();
  const uncertain = await submit();
  await pool.query(`UPDATE contact_notification_jobs SET status=CASE WHEN enquiry_id=$1 THEN 'leased' ELSE 'sending' END,
    lease_token='old-worker', lease_expires_at=NOW()-INTERVAL '1 second'`, [safe.id]);
  await processContactNotifications();
  assert.equal((await jobFor(safe.id)).status, "accepted");
  assert.equal((await jobFor(uncertain.id)).status, "uncertain");
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].messageId, safe.email_message_id);
  await processContactNotifications();
  assert.equal(smtpCalls.length, 1);
  const inbox = await (await request("/admin/contact-enquiries")).json();
  assert.equal(inbox.enquiries.find((item: any) => item.id === uncertain.id).message, uncertain.message);
});
test("temporary explicit SMTP rejections retry with backoff and a stable Message-ID, then stop at five attempts", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  setSmtpFailure({ responseCode: 451 });
  for (let attempt = 1; attempt <= 5; attempt++) {
    await processContactNotifications();
    const job = await jobFor(row.id);
    assert.equal(job.attempts, attempt);
    assert.equal(job.status, attempt === 5 ? "failed" : "pending");
    assert.ok(new Date(job.next_attempt_at).getTime() > Date.now());
    await processContactNotifications(); // Not due, so no additional send.
    assert.equal(smtpCalls.length, attempt);
    await due();
  }
  assert.equal(new Set(smtpCalls.map(call => call.messageId)).size, 1);
  assert.equal(smtpCalls[0].messageId, row.email_message_id);
});
test("a proven connection failure retries successfully even after recipient settings change", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  setSmtpFailure({ code: "ESOCKET", originalCode: "ECONNREFUSED" });
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).status, "pending");
  await configure("replacement@example.test");
  setSmtpFailure(null);
  await due();
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).status, "accepted");
  assert.equal(smtpCalls.length, 2);
  assert.ok(smtpCalls.every(call => call.to === adminEmail && call.messageId === row.email_message_id));
});
test("post-DATA disconnects labelled CONN remain frozen across worker restarts", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  setSmtpFailure({ code: "ESOCKET", command: "CONN" });
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).status, "uncertain");
  setSmtpFailure(null);
  await due();
  await Promise.all([processContactNotifications(), processContactNotifications()]);
  assert.equal(smtpCalls.length, 1);
});
test("disabling pauses queued jobs and never backfills enquiries submitted while disabled", async () => {
  processOnSubmit = false;
  await configure();
  const queued = await submit();
  await configure("", false);
  const disabled = await submit();
  await processContactNotifications();
  assert.equal(smtpCalls.length, 0);
  assert.equal(await jobFor(disabled.id), undefined);
  await configure("replacement@example.test");
  await processContactNotifications();
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, adminEmail);
  assert.equal((await jobFor(queued.id)).status, "accepted");
  assert.equal(await jobFor(disabled.id), undefined);
});
test("missing SMTP configuration retains the job without consuming a send attempt", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  const password = process.env.GMAIL_SMTP_APP_PASSWORD;
  delete process.env.GMAIL_SMTP_APP_PASSWORD;
  try {
    await processContactNotifications();
    const job = await jobFor(row.id);
    assert.equal(job.status, "pending");
    assert.equal(job.attempts, 0);
    assert.equal(smtpCalls.length, 0);
  } finally { process.env.GMAIL_SMTP_APP_PASSWORD = password; }
  await due();
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).status, "accepted");
});
test("outbox persistence failure rolls back the enquiry instead of returning false success", async () => {
  await configure();
  await pool.query("ALTER TABLE contact_notification_jobs ADD CONSTRAINT isolated_job_failure CHECK (recipient <> 'admin-contact@example.test')");
  try {
    const result = await request("/contact-enquiries", "POST", {
      name: "Outbox failure", email: customerEmail, topic: "Something else", message: "This must not return success.",
    }, "");
    assert.equal(result.status, 503);
    assert.equal((await pool.query("SELECT COUNT(*) FROM contact_enquiries")).rows[0].count, "0");
    assert.equal(smtpCalls.length, 0);
  } finally { await pool.query("ALTER TABLE contact_notification_jobs DROP CONSTRAINT isolated_job_failure"); }
});
test("failure to record SMTP acceptance leaves the job unsafe to retry", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  await pool.query("ALTER TABLE contact_notification_jobs ADD CONSTRAINT isolated_acceptance_failure CHECK (status <> 'accepted')");
  try {
    await assert.rejects(processContactNotifications());
    assert.equal((await jobFor(row.id)).status, "sending");
    assert.equal(smtpCalls.length, 1); // Provider accepted, database write did not.
  } finally { await pool.query("ALTER TABLE contact_notification_jobs DROP CONSTRAINT isolated_acceptance_failure"); }
  await pool.query("UPDATE contact_notification_jobs SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE enquiry_id=$1", [row.id]);
  await processContactNotifications();
  assert.equal((await jobFor(row.id)).status, "uncertain");
  assert.equal(smtpCalls.length, 1);
});
test("a late SMTP response cannot overwrite an expired lease frozen by another worker", async () => {
  processOnSubmit = false;
  await configure();
  const row = await submit();
  let release = () => {};
  holdSmtp(new Promise<void>(resolve => { release = resolve; }));
  const first = processContactNotifications();
  try {
    await waitForStatus(row.id, "sending");
    await pool.query("UPDATE contact_notification_jobs SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE enquiry_id=$1", [row.id]);
    await processContactNotifications();
    assert.equal((await jobFor(row.id)).status, "uncertain");
  } finally { release(); await first; }
  assert.equal((await jobFor(row.id)).status, "uncertain");
  assert.equal((await waitForStatus(row.id, "uncertain")).email_message_id, row.email_message_id);
  await processContactNotifications();
  assert.equal(smtpCalls.length, 1);
});
async function saveLists(body: unknown) {
  const result = await request("/admin/contact-notification-settings", "PUT", body);
  assert.equal(result.status, 200);
  return result.json();
}
async function newPaidOrder() {
  const order = await createPendingOrder({
    userId: "guest_contact_notification_test", email: "buyer-not-allowlisted@example.test", customerName: "Admin copy test",
    phone: "", address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
    delivery: "Standard", subtotal: 1999, deliveryAmount: 0, discountAmount: 0, total: 1999, vatAmount: 333,
    expiresAt: new Date(Date.now() + 60_000),
    items: [{ productId: "contact-admin-order-test", name: "Test Bag", quantity: 1, unitAmount: 1999, total: 1999 }],
  });
  testOrders.push(order.id);
  await finalizePaidOrder(order.id, `pi_contact_admin_${order.id}`);
  return order;
}
test("contact recipient lists normalize and deduplicate, with independent per-recipient results", async () => {
  await saveLists({ adminEmails: [" FIRST@example.test ", "second@example.test", "first@example.test"], enabled: true });
  setRecipientFailure("second@example.test", { code: "EAUTH", responseCode: 535 });
  const row = await submit();
  const stored = await waitForStatus(row.id, "partial");
  assert.deepEqual(smtpCalls.map(mail => mail.to), ["first@example.test", "second@example.test"]);
  assert.equal(new Set(smtpCalls.map(mail => mail.messageId)).size, 2);
  assert.deepEqual(stored.email_recipients.map((item: any) => item.status), ["accepted", "failed"]);
});
test("empty contact list uses the verified admin account email", async () => {
  const settings = await saveLists({ adminEmails: [], enabled: true });
  assert.equal(settings.fallbackAdminEmail, "default-admin@example.test");
  const row = await submit();
  await waitForStatus(row.id, "accepted");
  assert.equal(smtpCalls[0].to, "default-admin@example.test");
});
test("editing contact settings preserves separate order recipient configuration", async () => {
  await saveLists({ orderAdminEmails: ["orders-admin@example.test"], orderEnabled: true });
  await saveLists({ adminEmails: ["contact-admin@example.test"], enabled: true });
  const settings = await (await request("/admin/contact-notification-settings")).json();
  assert.deepEqual(settings.orderAdminEmails, ["orders-admin@example.test"]);
  assert.deepEqual(settings.adminEmails, ["contact-admin@example.test"]);
  assert.equal(settings.orderEnabled, true);
});
test("new paid orders enqueue one admin copy per unique recipient without bypassing customer restrictions", async () => {
  await saveLists({ orderAdminEmails: ["owner@example.test", "manager@example.test", "owner@example.test"], orderEnabled: true });
  const order = await newPaidOrder();
  await finalizePaidOrder(order.id, `pi_contact_admin_${order.id}`);
  const jobs = (await pool.query("SELECT * FROM store_order_email_notifications WHERE order_id=$1", [order.id])).rows;
  assert.equal(jobs.filter(job => job.notification_type.startsWith("admin_order_confirmation:")).length, 2);
  await processOrderConfirmations();
  assert.deepEqual(smtpCalls.map(mail => mail.to).sort(), ["manager@example.test", "owner@example.test"]);
  assert.equal(new Set(smtpCalls.map(mail => mail.messageId)).size, 2);
  assert.ok(smtpCalls.every(mail => mail.subject.startsWith("Admin copy")));
  const customerJob = (await pool.query("SELECT status FROM store_order_email_notifications WHERE order_id=$1 AND notification_type='order_confirmation'", [order.id])).rows[0];
  assert.equal(customerJob.status, "pending");
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 2);
});
test("empty order recipient list falls back to admin and settings never backfill historical orders", async () => {
  const old = await newPaidOrder();
  await saveLists({ orderAdminEmails: [], orderEnabled: true });
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
  assert.equal((await pool.query("SELECT COUNT(*) FROM store_order_email_notifications WHERE order_id=$1 AND recipient_email IS NOT NULL", [old.id])).rows[0].count, "0");
  await newPaidOrder();
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, "default-admin@example.test");
});
test("disabled and removed order recipients cannot receive queued copies", async () => {
  await saveLists({ orderAdminEmails: ["old-admin@example.test"], orderEnabled: true });
  await newPaidOrder();
  await saveLists({ orderEnabled: false });
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
  await saveLists({ orderAdminEmails: ["new-admin@example.test"], orderEnabled: true });
  await processOrderConfirmations();
  assert.equal(smtpCalls.length, 0);
});
test("retrying one contact recipient never resends another recipient's accepted alert after restart or settings change", async () => {
  processOnSubmit = false;
  await saveLists({ adminEmails: ["first@example.test", "second@example.test"], enabled: true });
  const row = await submit();
  setRecipientFailure("second@example.test", { responseCode: 451 });
  await Promise.all([processContactNotifications(), processContactNotifications()]);
  let jobs = (await pool.query("SELECT * FROM contact_notification_jobs WHERE enquiry_id=$1 ORDER BY id", [row.id])).rows;
  assert.deepEqual(jobs.map(job => job.status), ["accepted", "pending"]);
  assert.equal(smtpCalls.length, 2);
  const originalId = jobs[1].message_id;
  await saveLists({ adminEmails: ["replacement@example.test"] });
  resetSmtp();
  await due();
  await Promise.all([processContactNotifications(), processContactNotifications()]);
  jobs = (await pool.query("SELECT * FROM contact_notification_jobs WHERE enquiry_id=$1 ORDER BY id", [row.id])).rows;
  assert.deepEqual(jobs.map(job => job.status), ["accepted", "accepted"]);
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].to, "second@example.test");
  assert.equal(smtpCalls[0].messageId, originalId);
  const stored = await waitForStatus(row.id, "accepted");
  assert.deepEqual(stored.email_recipients.map((item: any) => item.status), ["accepted", "accepted"]);
});
test("an ambiguous recipient is frozen independently while other recipient jobs complete", async () => {
  processOnSubmit = false;
  await saveLists({ adminEmails: ["first@example.test", "second@example.test"], enabled: true });
  const row = await submit();
  setRecipientFailure("first@example.test", { code: "ESOCKET", command: "CONN" });
  await Promise.all([processContactNotifications(), processContactNotifications()]);
  const stored = await waitForStatus(row.id, "partial");
  assert.deepEqual(stored.email_recipients.map((item: any) => item.status), ["uncertain", "accepted"]);
  assert.equal(smtpCalls.length, 2);
  await due();
  await processContactNotifications();
  assert.equal(smtpCalls.length, 2);
});

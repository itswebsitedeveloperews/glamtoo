import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { pool } from "@workspace/db";
import router from "../src/routes/emailBrandingTests";
import { brandingApproval, buildBrandingSamples, sendBrandingBatch, type BrandingTestStore } from "../src/emailBrandingTests";
import { brandingTestStore, listBrandingSamples } from "../src/emailBrandingTestStore";
import { resetSmtp, smtpCalls, holdSmtp, setMismatchedRecipient, setSmtpFailure } from "./fixtures/gmail-smtp";

let server: Server;
let origin: string;
const recipient = "approved@example.test";
before(async () => {
  Object.assign(process.env, {
    EMAIL_BRANDING_TEST_RECIPIENT: recipient, EMAIL_BRANDING_TEST_APPROVAL_ID: "isolated-review-approval",
    GMAIL_SMTP_USER: "sender@example.test", GMAIL_SMTP_AUTH_MODE: "app_password",
    GMAIL_SMTP_APP_PASSWORD: "isolated-password", GMAIL_SMTP_CLIENT_ID: "isolated-client",
    GMAIL_SMTP_CLIENT_SECRET: "isolated-secret", SESSION_SECRET: "isolated-session",
    GMAIL_SMTP_OAUTH_REDIRECT_URI: "https://shop.example.test/api/gmail/oauth/callback",
    ORDER_EMAIL_ALLOWED_RECIPIENTS: "", ORDER_EMAIL_SEND_TO_ALL: "false",
  });
  delete process.env.ADMIN_EMAILS;
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(async () => {
  resetSmtp(); await pool.query("DELETE FROM store_email_branding_tests");
  process.env.EMAIL_BRANDING_TEST_RECIPIENT = recipient;
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
async function request(method = "GET", user = "oauth-admin", body?: unknown, requestOrigin = "https://shop.example.test") {
  return fetch(`${origin}/api/admin/email-branding-tests`, {
    method, headers: { "x-test-user": user, Origin: requestOrigin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const body = () => ({ recipient, confirmation: "SEND FIVE SYNTHETIC EMAILS" });

test("both methods require admin access and never cache authorization failures", async () => {
  for (const method of ["GET", "POST"]) for (const [user, code] of [["", 401], ["customer", 403]] as const) {
    const response = await request(method, user, method === "POST" ? body() : undefined);
    assert.equal(response.status, code); assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(smtpCalls.length, 0);
});
test("GET is read-only; POST requires same origin, exact recipient and confirmation, with no extra fields", async () => {
  const status = await (await request()).json();
  assert.equal(status.canSend, true); assert.equal(status.recipient, recipient);
  assert.equal(smtpCalls.length, 0);
  for (const invalid of [{ ...body(), recipient: "other@example.test" }, { ...body(), confirmation: "yes" }, { ...body(), cc: "other@example.test" }]) {
    assert.equal((await request("POST", "oauth-admin", invalid)).status, 400);
  }
  assert.equal((await request("POST", "oauth-admin", body(), "https://foreign.example")).status, 403);
  assert.equal((await request("POST", "oauth-admin", body(), "")).status, 403);
  assert.equal(smtpCalls.length, 0);
});
test("broad customer rollout switches cannot enable synthetic tests without their own approval", async () => {
  delete process.env.EMAIL_BRANDING_TEST_RECIPIENT;
  process.env.ORDER_EMAIL_SEND_TO_ALL = "true";
  try {
    assert.equal((await (await request()).json()).canSend, false);
    assert.equal((await request("POST", "oauth-admin", body())).status, 400);
    assert.equal(smtpCalls.length, 0);
  } finally { process.env.ORDER_EMAIL_SEND_TO_ALL = "false"; }
});
test("missing Gmail authorization blocks before reserving or sending anything", async () => {
  delete process.env.GMAIL_SMTP_APP_PASSWORD;
  try {
    assert.equal((await request("POST", "oauth-admin", body())).status, 503);
    assert.equal(smtpCalls.length, 0);
    assert.deepEqual(await listBrandingSamples(brandingApproval()!.key), []);
  } finally { process.env.GMAIL_SMTP_APP_PASSWORD = "isolated-password"; }
});
test("failed authentication does not consume the approval or expose credentials", async () => {
  setSmtpFailure({ code: "EAUTH" });
  const response = await request("POST", "oauth-admin", body());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /isolated-password|isolated-secret|private recipient data/);
  assert.equal(smtpCalls.length, 0);
  assert.deepEqual(await listBrandingSamples(brandingApproval()!.key), []);
});
test("one explicit request sends exactly five MIME-ready synthetic samples, without business records", async () => {
  const businessCounts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM store_orders) AS orders,
    (SELECT count(*)::int FROM contact_enquiries) AS enquiries`)).rows[0];
  const before = await businessCounts();
  const response = await request("POST", "oauth-admin", body());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.canSend, false); assert.equal(result.samples.length, 5);
  assert.ok(result.samples.every((sample: any) => sample.status === "accepted"));
  assert.equal(new Set(result.samples.map((s: any) => s.marker)).size, 1);
  assert.equal(new Set(result.samples.map((s: any) => s.messageId)).size, 5);
  assert.equal(smtpCalls.length, 5);
  for (const call of smtpCalls) {
    assert.equal(call.to, recipient); assert.deepEqual(call.envelope.to, [recipient]);
    assert.equal(call.cc, undefined); assert.equal(call.bcc, undefined);
    assert.match(call.subject, /^\[SYNTHETIC GT-QA-/);
    assert.match(call.text, /no order, payment or refund exists/);
    assert.match(call.html, /no order, payment or refund exists/);
    assert.ok(call.attachments[0].content.length > 0);
    assert.equal(result.samples.some((s: any) => s.messageId === call.messageId), true);
  }
  assert.equal(smtpCalls.find(c => c.subject.includes("contact enquiry")).replyTo, "synthetic@example.invalid");
  assert.deepEqual(await businessCounts(), before);
  assert.equal((await request("POST", "oauth-admin", body())).status, 409);
  await request(); assert.equal(smtpCalls.length, 5);
  assert.equal(process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS, "");
  assert.equal(process.env.ORDER_EMAIL_SEND_TO_ALL, "false");
});
test("concurrent requests consume a single durable approval and never duplicate SMTP sends", async () => {
  let release!: () => void;
  holdSmtp(new Promise<void>(resolve => { release = resolve; }));
  const first = request("POST", "oauth-admin", body());
  try {
    for (let i = 0; i < 100 && !smtpCalls.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(smtpCalls.length, 1);
    assert.equal((await request("POST", "oauth-admin", body())).status, 409);
  } finally { release(); }
  assert.equal((await first).status, 200);
  assert.equal(smtpCalls.length, 5);
});
test("ambiguous SMTP outcome freezes the batch, skips remaining samples and cannot be resent", async () => {
  setMismatchedRecipient();
  assert.equal((await request("POST", "oauth-admin", body())).status, 200);
  const rows = await listBrandingSamples(brandingApproval()!.key);
  assert.equal(rows.filter(s => s.status === "uncertain").length, 1);
  assert.equal(rows.filter(s => s.status === "not_sent").length, 4);
  assert.equal(smtpCalls.length, 1);
  assert.equal((await request("POST", "oauth-admin", body())).status, 409);
  assert.equal(smtpCalls.length, 1);
});
test("a failed acceptance write preserves the sending marker and never attempts another sample", async () => {
  let sends = 0;
  const store: BrandingTestStore = {
    reserve: brandingTestStore.reserve,
    async update(key, variant, status) {
      if (status === "accepted") throw new Error("Simulated storage outage after SMTP acceptance");
      await brandingTestStore.update(key, variant, status);
    },
  };
  await assert.rejects(sendBrandingBatch(brandingApproval()!, "oauth-admin", "https://shop.example.test", store, async () => { sends++; }));
  assert.equal(sends, 1);
  const rows = await listBrandingSamples(brandingApproval()!.key);
  assert.equal(rows.filter(s => s.status === "sending").length, 1);
  assert.equal(rows.filter(s => s.status === "reserved").length, 4);
  await assert.rejects(sendBrandingBatch(brandingApproval()!, "oauth-admin", "https://shop.example.test", brandingTestStore, async () => { sends++; }));
  assert.equal(sends, 1);
});
test("known transport rejection also stops permanently without consuming customer quotas", async () => {
  let calls = 0;
  await sendBrandingBatch(brandingApproval()!, "oauth-admin", "https://shop.example.test", brandingTestStore,
    async () => { calls++; throw new Error("known rejection"); }, () => "failed");
  const rows = await listBrandingSamples(brandingApproval()!.key);
  assert.equal(calls, 1); assert.equal(rows.filter(s => s.status === "failed").length, 1);
  assert.equal(rows.filter(s => s.status === "not_sent").length, 4);
});
test("samples retain all five actual templates and embedded PNG branding", () => {
  const samples = buildBrandingSamples("https://shop.example.test");
  assert.deepEqual(samples.map(s => s.variant), ["order", "contact", "refund_processing", "refunded", "manual_resolution"]);
  for (const sample of samples) {
    assert.match(sample.message.html, /src="cid:glam-too-/);
    assert.equal(sample.message.attachments[0].content.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});

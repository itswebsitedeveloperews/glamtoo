import assert from "node:assert/strict";
import http from "node:http";
import { before, after, afterEach, test } from "node:test";
import { pool, checkoutLockPool, stripeCustomerLockPool } from "@workspace/db";
import app from "../src/app";
import { isAdminUser, isBootstrapAdminUser } from "../src/adminAuth";
import { fingerprint, withDatabaseLock, consumeRate } from "../src/checkoutSafety";
import { resolveStripeCustomer } from "../src/stripeCustomers";
import { recoverExpiredPendingOrders } from "../src/routes/stripe";
import { finalizePaidOrder } from "../src/orderService";
import { intents, sessions, customers, fakeStripe, loseCreateResponse, setCancellationFails, setProviderScope } from "./fixtures/guest-stripe";
import { listShippingMethods } from "../src/shippingMethods";
import { checkoutOriginAllowed, guestCheckoutOwner } from "../src/checkoutIdentity";
import { getClerkProxyHost } from "../src/middlewares/clerkProxyMiddleware";

let server: http.Server;
let origin: string;
let delivery: string;
const product = `safety_${crypto.randomUUID().replace(/-/g, "")}`;
const cookie = `glam_too_guest_checkout=${"a".repeat(64)}`;
const owner = guestCheckoutOwner("a".repeat(64))!;
const input = () => ({
  email: "isolated@example.com", customerName: "Isolated Test",
  lines: [{ productId: product, quantity: 1 }], delivery,
  address: { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" },
});
const post = (body: unknown, key = crypto.randomUUID(), headers: Record<string, string> = {}, path = "payment-intent") => fetch(`${origin}/api/stripe/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, Cookie: cookie, Origin: origin, ...headers }, body: JSON.stringify(body),
});
const stock = async () => Number((await pool.query("SELECT stock FROM product_inventory WHERE product_id=$1", [product])).rows[0].stock);

before(async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/glam_checkout_test_/, "Never run these mutations against the application database");
  await pool.query("INSERT INTO product_inventory (product_id,catalog_product_id,name,description,unit_amount,stock,active) VALUES ($1,$1,'Test','',1999,1000,true)", [product]);
  delivery = String((await listShippingMethods(true))[0].id);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.TRUSTED_BROWSER_ORIGINS = origin;
  process.env.STOREFRONT_ORIGIN = origin;
});
afterEach(async () => {
  setCancellationFails(false);
  setProviderScope("acct_isolated", false);
  await pool.query("TRUNCATE checkout_attempts, checkout_rate_windows, stripe_customer_mappings, store_orders, inventory_reservations, coupon_reservations, coupons CASCADE");
  await pool.query("UPDATE product_inventory SET stock=1000 WHERE product_id=$1", [product]);
  intents.clear(); sessions.clear(); customers.clear();
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  await checkoutLockPool.end();
  await stripeCustomerLockPool.end();
});

test("bootstrap allowlist requires verified primary or secondary email; private admin roles remain trusted", () => {
  const allowlist = new Set(["owner@example.com"]);
  for (const status of [undefined, "unverified", "expired", "failed"]) {
    const user = { emailAddresses: [{ emailAddress: "OWNER@example.com", ...(status ? { verification: { status } } : {}) }] };
    assert.equal(isBootstrapAdminUser(user, allowlist), false);
    assert.equal(isAdminUser({ ...user, privateMetadata: { role: "admin" } }, allowlist), true);
  }
  assert.equal(isBootstrapAdminUser({ emailAddresses: [{ emailAddress: " OWNER@EXAMPLE.COM ", verification: { status: "verified" } }] }, allowlist), true);
  assert.equal(isBootstrapAdminUser({ emailAddresses: [{ emailAddress: "other@example.com", verification: { status: "verified" } }, { emailAddress: "owner@example.com", verification: { status: "unverified" } }] }, allowlist), false);
  assert.equal(isBootstrapAdminUser({ emailAddresses: [{ emailAddress: "other@example.com" }, { emailAddress: "owner@example.com", verification: { status: "verified" } }] }, allowlist), true);
});

test("unchanged retries reuse the owned payment and allocations; changed input conflicts", async () => {
  const key = crypto.randomUUID();
  const first = await post(input(), key);
  assert.equal(first.status, 200);
  const body = await first.json();
  const second = await post(input(), key);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), body);
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT count(*) FROM store_orders")).rows[0].count, "1");
  assert.equal((await post({ ...input(), customerName: "Changed" }, key)).status, 409);
  assert.equal((await post(input(), key, { Cookie: `glam_too_guest_checkout=${"b".repeat(64)}` })).status, 200);
  assert.equal(intents.size, 2, "The same key in a different owner namespace never exposes the old payment");
});

test("validation failures consume throttle capacity but do not strand active checkout slots", async () => {
  for (let n = 0; n < 5; n++) assert.equal((await post({ ...input(), email: "invalid" })).status, 400);
  assert.equal((await pool.query("SELECT count(*) FROM checkout_attempts")).rows[0].count, "0");
  assert.equal((await post(input())).status, 200);
  assert.equal(await stock(), 999);
});

test("concurrent retries across connections never create duplicate payments or reservations", async () => {
  const key = crypto.randomUUID();
  const responses = await Promise.all(Array.from({ length: 8 }, () => post(input(), key)));
  assert.ok(responses.some((response) => response.status === 200));
  assert.ok(responses.every((response) => [200, 429].includes(response.status)));
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
  assert.equal((await post(input(), key)).status, 200);
});

test("lost provider response survives a retry with only one pending order and allocation", async () => {
  const key = crypto.randomUUID();
  loseCreateResponse();
  assert.equal((await post(input(), key)).status, 503);
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT payment_reference FROM store_orders")).rows[0].payment_reference, null);
  const retry = await post(input(), key);
  assert.equal(retry.status, 200);
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
  const body = await retry.json();
  assert.equal((await pool.query("SELECT payment_reference FROM inventory_reservations WHERE product_id=$1", [product])).rows[0].payment_reference, body.paymentIntentId);
});

test("HTTP server restart retains the retry key, order snapshot, and provider identity", async () => {
  const key = crypto.randomUUID();
  loseCreateResponse();
  assert.equal((await post(input(), key)).status, 503);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.TRUSTED_BROWSER_ORIGINS = origin;
  process.env.STOREFRONT_ORIGIN = origin;
  assert.equal((await post(input(), key)).status, 200);
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
});

test("a paid webhook before response reattachment settles order-ID allocations exactly once", async () => {
  await pool.query("INSERT INTO coupons (code,discount_type,discount_value,active,minimum_spend,usage_limit,usage_count) VALUES ('ISOLATED','fixed',100,true,0,1,0)");
  const key = crypto.randomUUID();
  loseCreateResponse();
  assert.equal((await post({ ...input(), couponCode: "ISOLATED" }, key)).status, 503);
  const payment = [...intents.values()][0];
  payment.status = "succeeded";
  for (let n = 0; n < 2; n++) await finalizePaidOrder(payment.metadata.glam_too_order_id, payment.id);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT count(*) FROM inventory_reservations")).rows[0].count, "0");
  assert.equal((await pool.query("SELECT count(*) FROM coupon_reservations")).rows[0].count, "0");
  assert.equal((await pool.query("SELECT usage_count FROM coupons WHERE code='ISOLATED'")).rows[0].usage_count, 1);
  const response = await post({ ...input(), couponCode: "ISOLATED" }, key);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "checkout_completed");
});

test("pre-provider allocation failure restores stock and does not create a payment", async () => {
  await pool.query("INSERT INTO coupons (code,discount_type,discount_value,active,minimum_spend,usage_limit,usage_count) VALUES ('ISOLATED','fixed',100,true,0,1,0)");
  const body = { ...input(), couponCode: "ISOLATED" };
  assert.equal((await post(body)).status, 200);
  const result = await post(body, crypto.randomUUID(), { Cookie: `glam_too_guest_checkout=${"c".repeat(64)}` });
  assert.equal(result.status, 400);
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 999);
});

test("recovery beyond guaranteed Stripe key retention finds metadata without recreating a payment", async () => {
  loseCreateResponse();
  assert.equal((await post(input())).status, 503);
  await pool.query("UPDATE store_orders SET expires_at=NOW()-interval '1 minute'");
  await pool.query("UPDATE checkout_attempts SET provider_started_at=NOW()-interval '25 hours'");
  const create = fakeStripe.paymentIntents.create;
  fakeStripe.paymentIntents.create = async () => { throw new Error("Must not recreate an old uncertain payment"); };
  try { await recoverExpiredPendingOrders(fakeStripe as any); }
  finally { fakeStripe.paymentIntents.create = create; }
  assert.equal(intents.size, 1);
  assert.equal(await stock(), 1000);
  assert.equal((await pool.query("SELECT payment_status FROM store_orders")).rows[0].payment_status, "cancelled");
});

test("expired complete hosted sessions with unresolved payment status keep allocations", async () => {
  assert.equal((await post(input(), crypto.randomUUID(), {}, "checkout")).status, 200);
  const session = [...sessions.values()][0];
  session.status = "complete";
  session.payment_status = "unpaid";
  await pool.query("UPDATE store_orders SET expires_at=NOW()-interval '1 minute'");
  await recoverExpiredPendingOrders(fakeStripe as any);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT payment_status FROM store_orders")).rows[0].payment_status, "pending");
});

test("provider mode change refuses replay of either cached or uncertain payment", async () => {
  const key = crypto.randomUUID();
  assert.equal((await post(input(), key)).status, 200);
  setProviderScope("acct_isolated", true);
  const conflict = await post(input(), key);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "provider_changed");
});

test("hosted checkout also reuses its frozen session and stock", async () => {
  const key = crypto.randomUUID();
  const first = await post(input(), key, {}, "checkout");
  assert.equal(first.status, 200);
  assert.equal((await post(input(), key, {}, "checkout")).status, 200);
  assert.equal(sessions.size, 1);
  assert.equal(await stock(), 999);
  assert.match([...sessions.values()][0].success_url, new RegExp(`^${origin}`));
});

test("per-owner pending bound applies to guests and signed-in accounts without releasing existing stock", async () => {
  for (const headers of [{}, { "x-test-user": "user_isolated" }]) {
    for (let n = 0; n < 3; n++) assert.equal((await post(input(), crypto.randomUUID(), headers)).status, 200);
    const limited = await post(input(), crypto.randomUUID(), headers);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "reservation_limit");
    assert.ok(limited.headers.get("retry-after"));
  }
  assert.equal(await stock(), 994);
});

test("network reservation bound cannot be reset with a fresh guest cookie", async () => {
  for (let n = 1; n <= 10; n++) {
    const freshCookie = `glam_too_guest_checkout=${n.toString(16).padStart(64, "0")}`;
    assert.equal((await post(input(), crypto.randomUUID(), { Cookie: freshCookie, "X-Forwarded-For": `203.0.113.${n}` })).status, 200);
  }
  const limited = await post(input(), crypto.randomUUID(), { Cookie: `glam_too_guest_checkout=${"f".repeat(64)}` });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "reservation_limit");
  assert.equal(await stock(), 990);
});

test("atomic rate windows are shared across connections and reject after the configured limit", async () => {
  const key = crypto.randomUUID();
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await consumeRate(first, key, 2);
    await consumeRate(second, key, 2);
    await assert.rejects(consumeRate(first, key, 2), /Too many checkout attempts/);
  } finally { first.release(); second.release(); }
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const holding = withDatabaseLock(["isolated-shared-lock"], async () => {
    started();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await ready;
  await assert.rejects(withDatabaseLock(["isolated-shared-lock"], async () => undefined), /already being prepared/);
  release(); await holding;
});

test("interrupted expired creation is reattached before terminal cancellation; failed cancellation retains stock", async () => {
  loseCreateResponse();
  assert.equal((await post(input())).status, 503);
  await pool.query("UPDATE store_orders SET expires_at=NOW()-interval '1 minute'");
  setCancellationFails(true);
  await recoverExpiredPendingOrders(fakeStripe as any);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT payment_status FROM store_orders")).rows[0].payment_status, "pending");
  setCancellationFails(false);
  await recoverExpiredPendingOrders(fakeStripe as any);
  assert.equal(await stock(), 1000);
  assert.equal((await pool.query("SELECT payment_status FROM store_orders")).rows[0].payment_status, "cancelled");
});

test("retryable card failure retains coupon and stock until verified terminal cancellation", async () => {
  await pool.query("INSERT INTO coupons (code,discount_type,discount_value,active,minimum_spend,usage_limit,usage_count) VALUES ('ISOLATED','fixed',100,true,0,1,0)");
  const key = crypto.randomUUID();
  const payment = await (await post({ ...input(), couponCode: "ISOLATED" }, key)).json();
  assert.equal((await post({ ...input(), couponCode: "ISOLATED" }, key)).status, 200);
  assert.equal((await pool.query("SELECT count(*) FROM coupon_reservations")).rows[0].count, "1");
  setCancellationFails(true);
  assert.equal((await post({ paymentIntentId: payment.paymentIntentId }, crypto.randomUUID(), {}, "abandon-payment")).status, 503);
  assert.equal(await stock(), 999);
  assert.equal((await pool.query("SELECT count(*) FROM coupon_reservations")).rows[0].count, "1");
  setCancellationFails(false);
  assert.equal((await post({ paymentIntentId: payment.paymentIntentId }, crypto.randomUUID(), {}, "abandon-payment")).status, 200);
  assert.equal(await stock(), 1000);
  assert.equal((await pool.query("SELECT count(*) FROM coupon_reservations")).rows[0].count, "0");
});

test("legacy customers beyond record 100 are found by account metadata, then retrieved directly", async () => {
  for (let index = 0; index < 110; index++) customers.set(`cus_decoy_${index}`, { id: `cus_decoy_${index}`, email: "same@example.com", metadata: { clerk_user_id: "someone_else" } });
  const target = { id: "cus_target", email: "same@example.com", metadata: { clerk_user_id: "user_legacy" } };
  customers.set(target.id, target);
  assert.equal((await resolveStripeCustomer(fakeStripe as any, "user_legacy"))?.id, target.id);
  const original = fakeStripe.customers.list;
  fakeStripe.customers.list = async () => { throw new Error("Mapped users must not scan Stripe"); };
  try {
    assert.equal((await resolveStripeCustomer(fakeStripe as any, "user_legacy"))?.id, target.id);
    const response = await fetch(`${origin}/api/stripe/payment-methods`, { headers: { "x-test-user": "user_legacy" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentMethods[0].last4, "4242");
  } finally { fakeStripe.customers.list = original; }
  setProviderScope("acct_other", false);
  await resolveStripeCustomer(fakeStripe as any, "user_legacy");
  setProviderScope("acct_other", true);
  await resolveStripeCustomer(fakeStripe as any, "user_legacy");
  assert.equal((await pool.query("SELECT count(*) FROM stripe_customer_mappings WHERE user_id='user_legacy'")).rows[0].count, "3");
});

test("customer first creation is serialized; mappings never trust billing email or another user's metadata", async () => {
  const responses = await Promise.allSettled(Array.from({ length: 5 }, () => resolveStripeCustomer(fakeStripe as any, "user_new", { email: "same@example.com", name: "Test" })));
  assert.ok(responses.some((response) => response.status === "fulfilled"));
  assert.equal(customers.size, 1);
  const created = [...customers.values()][0];
  created.metadata.clerk_user_id = "other";
  await assert.rejects(resolveStripeCustomer(fakeStripe as any, "user_new"), /could not be verified/);
});

test("exact-origin CORS and mutation checks are independent; raw signed webhooks and safe callbacks remain available", async () => {
  const untrusted = "https://attacker.example";
  const response = await post(input(), crypto.randomUUID(), { Origin: untrusted, "X-Forwarded-Host": "attacker.example" });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal((await post(input(), crypto.randomUUID(), { Origin: "null" })).status, 403);
  const cors = await fetch(`${origin}/api/healthz`, { headers: { Origin: origin } });
  assert.equal(cors.headers.get("access-control-allow-origin"), origin);
  assert.equal(cors.headers.get("access-control-allow-credentials"), "true");
  assert.equal((await post(input(), crypto.randomUUID(), { Origin: "", "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post(input(), crypto.randomUUID(), { Origin: "" })).status, 200);
  const webhook = await fetch(`${origin}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "isolated-signed", Origin: untrusted }, body: '{"isolated":true}' });
  assert.equal(webhook.status, 200);
  assert.equal((await fetch(`${origin}/api/stripe/webhook`, { method: "POST", body: "{}" })).status, 400);
  const request = { headers: { host: new URL(origin).host, "x-forwarded-host": "attacker.example" } };
  assert.equal(getClerkProxyHost(request), new URL(origin).host);
  assert.equal(checkoutOriginAllowed({ get: (name: string) => name === "origin" ? untrusted : "attacker.example" } as any), false);
});

test("fingerprints normalize object key order but retain checkout detail changes", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint(input()), fingerprint({ ...input(), delivery: "changed" }));
});

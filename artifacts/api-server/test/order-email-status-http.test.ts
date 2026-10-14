import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import express from "express";
import router from "../src/routes/stripe";
import customerRetryRouter from "../src/routes/customerEmailRetry";
import { baselineHeaders } from "../src/browserSecurity";
import { statusHttpFixture as fixture, statusHttpPayload } from "./fixtures/order-email-status-http";

// The build runner replaces only Clerk and the status data service. These
// requests execute the real Express route and real requireAdmin middleware.
// No application entrypoint, worker, database, Stripe or SMTP call is started.
const app = express();
app.use(express.json());
app.use(baselineHeaders);
app.use("/api", router);
app.use("/api", customerRetryRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));
beforeEach(() => {
  fixture.access = "admin";
  fixture.result = "found";
  fixture.references.length = 0;
  fixture.approvals.length = 0;
});

async function get(reference = "pi_saved_fixture") {
  return fetch(`${origin}/api/admin/orders/${reference}/email-status`);
}

test("anonymous and non-admin callers cannot look up order-email records", async () => {
  for (const [access, status, message] of [
    ["anonymous", 401, "Sign in to continue."],
    ["customer", 403, "This account is not authorized for admin access."],
  ] as const) {
    fixture.access = access;
    const response = await get();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: message });
    assert.deepEqual(fixture.references, []);
  }
});

test("authorization failures return a generic 503 without internal credentials", async () => {
  fixture.access = "unavailable";
  const response = await get();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Admin access could not be verified right now." });
  assert.deepEqual(fixture.references, []);
});

test("authorized reads pass the saved payment reference through and disable caching", async () => {
  const response = await get("pi_saved_fixture");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), statusHttpPayload);
  assert.deepEqual(fixture.references, ["pi_saved_fixture"]);
});

test("invalid references are rejected before the status service is called", async () => {
  const response = await get("invalid%20reference");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A valid saved order reference is required." });
  assert.deepEqual(fixture.references, []);
});

test("missing saved orders return a generic 404", async () => {
  fixture.result = "missing";
  const response = await get();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Order not found." });
  assert.deepEqual(fixture.references, ["pi_saved_fixture"]);
});

test("status-service failures return a generic 503 without internal credentials", async () => {
  fixture.result = "unavailable";
  const response = await get();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Order email status could not be loaded. Please try again." });
  assert.deepEqual(fixture.references, ["pi_saved_fixture"]);
});

async function approve(body: unknown = { confirmation: "send_saved_order_confirmation" }, origin = "https://shop.example.test") {
  return fetch(`${originForTest()}/api/admin/orders/pi_saved_fixture/customer-email/retry`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}
function originForTest() { return origin; }

test("customer approval requires admin authorization and trusted origin before changing anything", async () => {
  for (const [access, status] of [["anonymous", 401], ["customer", 403], ["unavailable", 503]] as const) {
    fixture.access = access;
    const response = await approve();
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  fixture.access = "admin";
  assert.equal((await approve(undefined, "https://untrusted.example.test")).status, 403);
  assert.deepEqual(fixture.approvals, []);
});

test("approval accepts only the explicit action and cannot accept a replacement customer email", async () => {
  for (const body of [{}, { confirmation: "anything" }, { confirmation: "send_saved_order_confirmation", email: "replacement@example.test" }]) {
    assert.equal((await approve(body)).status, 400);
  }
  assert.deepEqual(fixture.approvals, []);
  const response = await approve();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome, "approved");
  assert.deepEqual(fixture.approvals, [{ reference: "pi_saved_fixture", actor: "user_http_fixture" }]);
});

test("approval errors remain private and never expose provider credentials", async () => {
  fixture.result = "missing";
  const missing = await approve();
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Order not found." });
  fixture.result = "unavailable";
  const failure = await approve();
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await failure.json(), { error: "Customer confirmation approval could not be saved. Refresh before trying again." });
});

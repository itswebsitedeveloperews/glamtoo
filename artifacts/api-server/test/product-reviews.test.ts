import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { pool } from "@workspace/db";
import {
  ensureProductReviews, listProductReviews, reviewFingerprint, reviewInput, reviewUpdateInput,
} from "../src/productReviews";
import reviewsRouter from "../src/routes/reviews";

after(async () => { await pool.end(); });
const sample = () => ({ rating: 5, title: "Lovely fit", body: "A comfortable piece.", displayName: "Review Tester", submissionId: randomUUID() });

test("review validation rejects invalid ratings, blank or oversized content, private fields and forged ownership", () => {
  assert.ok(reviewInput.safeParse(sample()).success);
  for (const patch of [
    { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: "5" },
    { title: "" }, { title: "   " }, { body: "\n\t" }, { displayName: " " },
    { title: "x".repeat(121) }, { body: "x".repeat(3001) }, { displayName: "x".repeat(81) },
    { submissionId: "not-a-uuid" }, { email: "private@example.test" }, { status: "approved" },
    { productId: 12 }, { userId: "another-customer" }, { verifiedPurchase: true }, { orderId: "another-order" },
  ]) assert.equal(reviewInput.safeParse({ ...sample(), ...patch }).success, false);
  assert.equal(reviewInput.parse({ ...sample(), title: " Trimmed " }).title, "Trimmed");
  assert.equal(reviewUpdateInput.safeParse(sample()).success, false);
  assert.ok(reviewUpdateInput.safeParse({ ...sample(), expectedRevision: 1 }).success);
});

test("duplicate fingerprint is scoped to the authenticated customer and parent product", () => {
  const input = sample();
  assert.equal(reviewFingerprint(1, input, "a"), reviewFingerprint(1, { ...input, body: " A   COMFORTABLE piece. " }, "a"));
  assert.notEqual(reviewFingerprint(1, input, "a"), reviewFingerprint(1, input, "b"));
  assert.notEqual(reviewFingerprint(1, input, "a"), reviewFingerprint(2, input, "a"));
});

test("verified purchase review API: auth, order status, variants, ownership, duplicate/edit retries, moderation and privacy", { skip: process.env.REVIEW_DB_TESTS !== "1" }, async () => {
  await ensureProductReviews();
  const catalog = await pool.query("SELECT products FROM store_catalog WHERE id=1");
  const products = catalog.rows[0].products.filter((p: { status: string }) => p.status === "Published");
  assert.ok(products.length >= 2);
  const [a, b] = products.map((p: { id: number }) => p.id);
  const marker = randomUUID();
  const purchaser = `review-policy-${marker}-purchaser`;
  const second = `review-policy-${marker}-second`;
  const outsider = `review-policy-${marker}-outsider`;
  const matrixUser = `review-policy-${marker}-matrix`;
  const admin = `review-test-admin-${marker}`;
  const orderIds: string[] = [];
  const users = [purchaser, second, outsider, matrixUser];
  const app = express().use(express.json()).use("/api", reviewsRouter);
  let server: Server | undefined;
  let base = "";
  async function request(path: string, user?: string, body?: object, method = body ? "POST" : "GET") {
    const result = await fetch(`${base}/api${path}`, {
      method, headers: { ...(user ? { "x-review-test-user": user } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, data: await result.json() as Record<string, any> };
  }
  async function order(user: string, product: number, variant: string | null = null) {
    const id = `review-policy-order-${randomUUID()}`; orderIds.push(id);
    await pool.query(`
      INSERT INTO store_orders(id,user_id,payment_status,email,customer_name,address_line_1,city,postcode,
        delivery_method,subtotal,delivery_amount,total,expires_at)
      VALUES($1,$2,'paid','private@example.test','Private Customer','Private address','Test','TE1 1ST','Test',100,0,100,now()+interval '1 day')
    `, [id, user]);
    await pool.query(`INSERT INTO store_order_items(order_id,product_id,variation_id,name,quantity,unit_amount,total)
      VALUES($1,$2,$3,'Name deliberately does not match catalogue',1,100,100)`, [id, String(product), variant]);
    return id;
  }
  const path = `/products/${a}/reviews`;
  const access = `/products/${a}/review-access`;
  try {
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const baseline = await request(path);
    assert.equal(baseline.status, 200, "Public reading does not require sign-in");
    assert.equal((await request(path, undefined, sample())).status, 401);
    assert.equal((await request(`${path}/mine`, undefined, { ...sample(), expectedRevision: 1 }, "PATCH")).status, 401);
    assert.equal((await request(access)).status, 401);
    assert.equal((await request(access, outsider)).status, 403);
    assert.equal((await request(path, outsider, { ...sample(), userId: purchaser, email: "private@example.test" })).status, 403);
    assert.equal((await request("/admin/reviews")).status, 401);
    assert.equal((await request("/admin/reviews", outsider)).status, 403);

    const statusOrder = await order(matrixUser, a, "a-purchased-variant");
    for (const [payment, fulfillment, resolution, cancelled] of [
      ["pending", "Processing", "none", false], ["pending", "Delivered", "none", false],
      ["cancelled", "Delivered", "none", false], ["paid", "Delivered", "refunded", false],
      ["paid", "Processing", "refund_pending", false], ["paid", "Shipped", "refund_processing", false],
      ["paid", "Delivered", "manual_resolution", false], ["paid", "Delivered", "none", true],
    ] as const) {
      await pool.query("UPDATE store_orders SET payment_status=$2,fulfillment_status=$3,payment_resolution=$4,cancelled_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE id=$1",
        [statusOrder, payment, fulfillment, resolution, cancelled]);
      assert.equal((await request(access, matrixUser)).status, 403, `${payment}/${fulfillment}/${resolution}/${cancelled} is ineligible`);
      assert.equal((await request(path, matrixUser, sample())).status, 403);
    }
    for (const fulfillment of ["Processing", "Shipped", "Delivered"]) {
      await pool.query("UPDATE store_orders SET payment_status='paid',payment_resolution='none',cancelled_at=NULL,fulfillment_status=$2 WHERE id=$1", [statusOrder, fulfillment]);
      assert.equal((await request(access, matrixUser)).status, 200, `Paid ${fulfillment} qualifies`);
    }
    const paidOrder = await order(purchaser, a, "purchased-variant");
    assert.equal((await request(`/products/${b}/review-access`, purchaser)).status, 403, "Parent product match, not product name or other product");
    assert.equal((await request(path, purchaser, { ...sample(), userId: outsider })).status, 400, "Ownership cannot be supplied in payload");

    const input = { ...sample(), title: `Policy test ${marker}` };
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => request(path, purchaser, input)));
    assert.ok(concurrent.every((r) => r.status === 202), JSON.stringify(concurrent));
    const saved = await pool.query("SELECT * FROM product_reviews WHERE user_id=$1 AND product_id=$2", [purchaser, a]);
    assert.equal(saved.rowCount, 1);
    const id = saved.rows[0].id;
    assert.equal(saved.rows[0].status, "pending");
    assert.equal(saved.rows[0].revision, 1);
    assert.equal((await request(path)).data.total, baseline.data.total, "Pending does not affect ratings");
    assert.equal((await request(path, purchaser, { ...input, submissionId: randomUUID() })).status, 409, "A second review requires editing");
    assert.equal((await request(path, purchaser, { ...input, title: "Key reused with different details" })).status, 409);
    assert.equal((await request(`/admin/reviews/${id}`, outsider, { status: "approved" }, "PATCH")).status, 403);
    assert.equal((await request(`/admin/reviews/${id}`, admin, { status: "approved" }, "PATCH")).status, 200);
    const approved = await request(path);
    const publicReview = approved.data.reviews.find((r: { id: number }) => r.id === id);
    assert.ok(publicReview);
    assert.equal(publicReview.verifiedPurchase, true);
    assert.deepEqual(Object.keys(publicReview).sort(), ["id","productId","rating","title","body","displayName","createdAt","verifiedPurchase"].sort());
    assert.equal(approved.data.total, baseline.data.total + 1);
    assert.ok(!JSON.stringify(approved.data).includes("private@example.test"));
    assert.ok(!JSON.stringify(approved.data).includes(purchaser));
    assert.ok(!JSON.stringify(approved.data).includes(paidOrder));
    assert.ok(!(await request(`/products/${b}/reviews`)).data.reviews.some((r: { id: number }) => r.id === id));

    const edited = { ...input, rating: 3, title: `Edited policy test ${marker}`, submissionId: randomUUID(), expectedRevision: 1 };
    assert.equal((await request(`${path}/mine`, purchaser, edited, "PATCH")).status, 202);
    assert.equal((await request(`${path}/mine`, purchaser, edited, "PATCH")).status, 202, "Lost-response edit retry is idempotent");
    assert.equal((await request(path, purchaser, input)).status, 202, "A delayed original-create retry cannot revert an edit");
    const own = await request(access, purchaser);
    assert.equal(own.data.review.title, edited.title);
    assert.equal(own.data.review.status, "pending");
    assert.equal(own.data.review.revision, 2);
    assert.equal((await request(path)).data.total, baseline.data.total, "An edit removes the approved contribution");
    assert.equal((await request(`${path}/mine`, purchaser, { ...edited, submissionId: randomUUID() }, "PATCH")).status, 409, "Stale edit cannot overwrite a newer revision");
    assert.equal((await request(`${path}/mine`, outsider, edited, "PATCH")).status, 403);
    await order(second, a, "another-variant");
    assert.equal((await request(`${path}/mine`, second, { ...edited, submissionId: randomUUID() }, "PATCH")).status, 404, "Cannot edit another customer's review even after buying");
    assert.equal((await request(path, second, { ...input, submissionId: randomUUID() })).status, 202, "Separate purchasers can write identical text");

    assert.equal((await request(`/admin/reviews/${id}`, admin, { status: "approved" }, "PATCH")).status, 200);
    const freshOwn = await request(access, purchaser);
    assert.equal(freshOwn.data.review.title, edited.title, "A fresh request recovers persistent edits");
    await pool.query("UPDATE store_orders SET payment_resolution='refunded' WHERE id=$1", [paidOrder]);
    assert.equal((await request(access, purchaser)).status, 403);
    assert.equal((await request(`${path}/mine`, purchaser, { ...edited, expectedRevision: 2, submissionId: randomUUID() }, "PATCH")).status, 403);
    assert.equal((await request(path)).data.total, baseline.data.total, "Fully refunded approved reviews lose public verified eligibility");
    assert.equal((await request(`/admin/reviews/${id}`, admin, { status: "approved" }, "PATCH")).status, 403);
    assert.equal((await request(`/admin/reviews/${id}`, admin, { status: "rejected" }, "PATCH")).status, 200);

    const legacy = await pool.query(`INSERT INTO product_reviews(product_id,rating,title,body,display_name,status,submission_id,fingerprint)
      VALUES($1,5,$2,'Old anonymous text','Legacy','approved',$3,$4) RETURNING id`,
      [a, marker, randomUUID(), randomUUID()]);
    try {
      assert.ok(!(await listProductReviews(a, 1)).reviews.some((r: { id: number }) => r.id === legacy.rows[0].id));
      assert.equal((await request(`/admin/reviews/${legacy.rows[0].id}`, admin, { status: "approved" }, "PATCH")).status, 403);
    } finally { await pool.query("DELETE FROM product_reviews WHERE id=$1", [legacy.rows[0].id]); }
  } finally {
    await pool.query("DELETE FROM product_reviews WHERE user_id=ANY($1::text[])", [users]);
    await pool.query("DELETE FROM store_orders WHERE id=ANY($1::text[])", [orderIds]);
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import {
  ensureProductReviews, isPublishedReviewProduct, listModerationReviews, listProductReviews,
  moderateReview, reviewFingerprint, reviewInput, ReviewConflictError, saveProductReview,
} from "../src/productReviews";

after(async () => { await pool.end(); });
const sample = () => ({ rating: 5, title: "Lovely fit", body: "A comfortable piece.", displayName: "Test reviewer", submissionId: randomUUID() });

test("review validation rejects empty, whitespace, out-of-range, fractional, wrong-type, oversized and private fields", () => {
  assert.ok(reviewInput.safeParse(sample()).success);
  for (const patch of [
    { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: "5" },
    { title: "" }, { title: "   " }, { body: "\n\t" }, { displayName: " " },
    { title: "x".repeat(121) }, { body: "x".repeat(3001) }, { displayName: "x".repeat(81) },
    { submissionId: "not-a-uuid" }, { email: "private@example.test" }, { status: "approved" }, { productId: 12 },
  ]) assert.equal(reviewInput.safeParse({ ...sample(), ...patch }).success, false, JSON.stringify(patch).slice(0, 100));
  const normalized = reviewInput.parse({ ...sample(), title: "  Trimmed title  ", body: "\nReview\n" });
  assert.equal(normalized.title, "Trimmed title");
  assert.equal(normalized.body, "Review");
});

test("duplicate fingerprint covers product and review content, not just a browser key", () => {
  const input = sample();
  assert.equal(reviewFingerprint(1, input), reviewFingerprint(1, { ...input, body: " A   COMFORTABLE piece. " }));
  assert.notEqual(reviewFingerprint(1, input), reviewFingerprint(2, input));
  assert.notEqual(reviewFingerprint(1, input), reviewFingerprint(1, { ...input, rating: 4 }));
});

test("database persistence, moderation, product isolation, privacy, averages and concurrent retries", { skip: process.env.REVIEW_DB_TESTS !== "1" }, async () => {
  await ensureProductReviews();
  const catalog = await pool.query("SELECT products FROM store_catalog WHERE id=1");
  const products = catalog.rows[0].products.filter((p: { status: string }) => p.status === "Published");
  assert.ok(products.length >= 2, "Integration needs two existing published products");
  const [a, b] = products.map((p: { id: number }) => p.id);
  const name = `Review test ${randomUUID()}`;
  const first = { ...sample(), displayName: name };
  const second = { ...sample(), displayName: name, title: "Second test review", rating: 3 };
  const other = { ...sample(), displayName: name, title: "Other product review", rating: 1 };
  const baseline = await listProductReviews(a, 1);
  try {
    assert.ok(await isPublishedReviewProduct(a));
    assert.equal(await isPublishedReviewProduct(999999999), false);
    await Promise.all(Array.from({ length: 12 }, () => saveProductReview(a, first)));
    await saveProductReview(a, { ...first, submissionId: randomUUID() });
    let rows = await pool.query("SELECT * FROM product_reviews WHERE display_name=$1", [name]);
    assert.equal(rows.rowCount, 1, "Concurrent and fresh-key duplicate retries create just one row");
    assert.equal(rows.rows[0].status, "pending");
    assert.equal(rows.rows[0].product_id, a);
    assert.equal((await listProductReviews(a, 1)).total, baseline.total, "Pending review must not affect summary");
    await assert.rejects(saveProductReview(a, { ...first, title: "Different payload" }), ReviewConflictError);
    await assert.rejects(saveProductReview(b, first), ReviewConflictError);
    const pending = await listModerationReviews("pending", 1);
    assert.ok(pending.reviews.some((r: { displayName: string }) => r.displayName === name));
    const id = rows.rows[0].id;
    await moderateReview(id, "approved");
    await saveProductReview(a, second);
    rows = await pool.query("SELECT id FROM product_reviews WHERE submission_id=$1", [second.submissionId]);
    await moderateReview(rows.rows[0].id, "approved");
    await saveProductReview(b, other);
    rows = await pool.query("SELECT id FROM product_reviews WHERE submission_id=$1", [other.submissionId]);
    await moderateReview(rows.rows[0].id, "approved");
    const visible = await listProductReviews(a, 1);
    assert.equal(visible.total, baseline.total + 2);
    const expected = await pool.query("SELECT round(avg(rating)::numeric,2)::float8 AS value FROM product_reviews WHERE product_id=$1 AND status='approved'", [a]);
    assert.equal(visible.averageRating, expected.rows[0].value);
    assert.ok(visible.reviews.some((r: { id: number }) => r.id === id));
    for (const review of visible.reviews) {
      assert.equal(review.productId, a);
      assert.deepEqual(Object.keys(review).sort(), ["id","productId","rating","title","body","displayName","createdAt"].sort());
    }
    await moderateReview(id, "rejected");
    assert.equal((await listProductReviews(a, 1)).total, baseline.total + 1);
    await moderateReview(id, "pending");
    assert.equal((await listProductReviews(a, 1)).total, baseline.total + 1);
    assert.equal(await moderateReview(999999999, "approved"), false);
    await assert.rejects(pool.query("UPDATE product_reviews SET rating=6 WHERE id=$1", [id]));
    await assert.rejects(pool.query("UPDATE product_reviews SET status='published' WHERE id=$1", [id]));
  } finally {
    await pool.query("DELETE FROM product_reviews WHERE display_name=$1", [name]);
  }
});

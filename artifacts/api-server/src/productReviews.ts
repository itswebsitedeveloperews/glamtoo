import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { z } from "zod";

// No email or account identifier is collected or stored. Names are public,
// explicitly labelled as such in the form; moderation has no email requirement.
export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(3000),
  displayName: z.string().trim().min(1).max(80).optional(),
  submissionId: z.string().uuid(),
}).strict();
export const moderationInput = z.object({ status: z.enum(["pending", "approved", "rejected"]) }).strict();
export type ReviewStatus = z.infer<typeof moderationInput>["status"];

let ready: Promise<void> | undefined;
export function ensureProductReviews() {
  // Additive, idempotent bootstrap follows the existing catalogue services and
  // also works when publishing against an existing production database.
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id serial PRIMARY KEY,
      product_id integer NOT NULL,
      rating integer NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      display_name text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      submission_id uuid NOT NULL CONSTRAINT product_reviews_submission_id_unique UNIQUE,
      fingerprint text NOT NULL CONSTRAINT product_reviews_fingerprint_unique UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      moderated_at timestamptz,
      CONSTRAINT product_reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
      CONSTRAINT product_reviews_status_check CHECK (status IN ('pending','approved','rejected')),
      CONSTRAINT product_reviews_content_check CHECK (
        length(btrim(title)) BETWEEN 1 AND 120 AND
        length(btrim(body)) BETWEEN 1 AND 3000 AND
        length(btrim(display_name)) BETWEEN 1 AND 80)
    );
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_reviews'::regclass AND conname='product_reviews_submission_id_key') THEN
        ALTER TABLE product_reviews RENAME CONSTRAINT product_reviews_submission_id_key TO product_reviews_submission_id_unique;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_reviews'::regclass AND conname='product_reviews_fingerprint_key') THEN
        ALTER TABLE product_reviews RENAME CONSTRAINT product_reviews_fingerprint_key TO product_reviews_fingerprint_unique;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS product_reviews_public_idx ON product_reviews(product_id,status,created_at,id);
    CREATE INDEX IF NOT EXISTS product_reviews_moderation_idx ON product_reviews(status,created_at,id);
  `).then(() => undefined).catch((error) => { ready = undefined; throw error; });
  return ready;
}

export function reviewFingerprint(productId: number, input: { rating: number; title: string; body: string; displayName: string }) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(JSON.stringify([
    productId, input.rating, normalize(input.title), normalize(input.body), normalize(input.displayName),
  ])).digest("hex");
}

export async function isPublishedReviewProduct(productId: number) {
  const result = await pool.query(`
    SELECT 1 FROM store_catalog c, jsonb_array_elements(c.products) p
    WHERE c.id=1 AND p->>'id'=$1 AND p->>'status'='Published' LIMIT 1
  `, [String(productId)]);
  return result.rowCount === 1;
}

export class ReviewConflictError extends Error {}
export async function saveProductReview(productId: number, input: z.infer<typeof reviewInput> & { displayName: string }) {
  await ensureProductReviews();
  const fingerprint = reviewFingerprint(productId, input);
  const inserted = await pool.query(`
    INSERT INTO product_reviews(product_id,rating,title,body,display_name,submission_id,fingerprint)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id
  `, [productId, input.rating, input.title, input.body, input.displayName, input.submissionId, fingerprint]);
  if (!inserted.rowCount) {
    // Do not allow a key to be reused for different content or another product.
    // Equivalent content under a new key is also a safe duplicate, never a
    // second public review. Return no stored content or moderation information.
    const existing = await pool.query("SELECT fingerprint FROM product_reviews WHERE submission_id=$1", [input.submissionId]);
    if (existing.rows[0] && existing.rows[0].fingerprint !== fingerprint) {
      throw new ReviewConflictError("This submission identifier belongs to different review details.");
    }
  }
}

const publicColumns = `id, product_id AS "productId", rating, title, body, display_name AS "displayName", created_at AS "createdAt"`;

export async function listProductReviews(productId: number, page: number) {
  await ensureProductReviews();
  // One statement/snapshot keeps the count, average, and page in agreement.
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM product_reviews WHERE product_id=$1 AND status='approved') AS total,
      (SELECT coalesce(round(avg(rating)::numeric,2),0)::float8 FROM product_reviews WHERE product_id=$1 AND status='approved') AS "averageRating",
      coalesce((SELECT json_agg(r) FROM (
        SELECT ${publicColumns} FROM product_reviews WHERE product_id=$1 AND status='approved'
        ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET $2
      ) r),'[]'::json) AS reviews
  `, [productId, (page - 1) * 10]);
  return { ...result.rows[0], page, pageSize: 10 };
}

export async function listModerationReviews(status: ReviewStatus, page: number) {
  await ensureProductReviews();
  const result = await pool.query(`
    SELECT (SELECT count(*)::int FROM product_reviews WHERE status=$1) AS total,
    coalesce((SELECT json_agg(r) FROM (
      SELECT ${publicColumns}, status,
        coalesce((SELECT p->>'name' FROM store_catalog c,jsonb_array_elements(c.products) p WHERE c.id=1 AND p->>'id'=product_id::text LIMIT 1),'Unavailable product') AS "productName"
      FROM product_reviews WHERE status=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2
    ) r),'[]'::json) AS reviews
  `, [status, (page - 1) * 20]);
  return { ...result.rows[0], page, pageSize: 20 };
}

export async function moderateReview(id: number, status: ReviewStatus) {
  await ensureProductReviews();
  const result = await pool.query("UPDATE product_reviews SET status=$2,moderated_at=now() WHERE id=$1 RETURNING id", [id, status]);
  return result.rowCount === 1;
}

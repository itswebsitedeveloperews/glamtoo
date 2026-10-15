import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { z } from "zod";
import { hasQualifyingReviewPurchase, qualifyingReviewPurchase } from "./reviewEligibility";

// Customer IDs stay private and come exclusively from verified authentication.
// No email is collected. Public names are labelled explicitly in the form.
export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(3000),
  displayName: z.string().trim().min(1).max(80).optional(),
  submissionId: z.string().uuid(),
}).strict();
export const reviewUpdateInput = reviewInput.extend({ expectedRevision: z.number().int().min(1) });
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
      user_id text,
      revision integer NOT NULL DEFAULT 1,
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
    ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS user_id text;
    ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_reviews'::regclass AND conname='product_reviews_submission_id_key') THEN
        ALTER TABLE product_reviews RENAME CONSTRAINT product_reviews_submission_id_key TO product_reviews_submission_id_unique;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_reviews'::regclass AND conname='product_reviews_fingerprint_key') THEN
        ALTER TABLE product_reviews RENAME CONSTRAINT product_reviews_fingerprint_key TO product_reviews_fingerprint_unique;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_reviews'::regclass AND conname='product_reviews_customer_product_unique') THEN
        ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_customer_product_unique UNIQUE(user_id,product_id);
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS product_review_submissions (
      submission_id uuid PRIMARY KEY,
      user_id text NOT NULL,
      product_id integer NOT NULL,
      fingerprint text NOT NULL,
      review_id integer NOT NULL CONSTRAINT product_review_submissions_review_id_product_reviews_id_fk REFERENCES product_reviews(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product_review_submissions'::regclass AND conname='product_review_submissions_review_id_fkey') THEN
        ALTER TABLE product_review_submissions RENAME CONSTRAINT product_review_submissions_review_id_fkey TO product_review_submissions_review_id_product_reviews_id_fk;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS product_reviews_public_idx ON product_reviews(product_id,status,created_at,id);
    CREATE INDEX IF NOT EXISTS product_reviews_moderation_idx ON product_reviews(status,created_at,id);
  `).then(() => undefined).catch((error) => { ready = undefined; throw error; });
  return ready;
}

export function reviewFingerprint(productId: number, input: { rating: number; title: string; body: string; displayName: string }, userId = "") {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(JSON.stringify([
    userId, productId, input.rating, normalize(input.title), normalize(input.body), normalize(input.displayName),
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
export class ReviewPurchaseError extends Error {}
export class OwnReviewNotFoundError extends Error {}

export async function saveProductReview(
  userId: string,
  productId: number,
  input: z.infer<typeof reviewInput> & { displayName: string; expectedRevision?: number },
  editing = false,
) {
  if (!userId) throw new ReviewPurchaseError("Sign in to review this product.");
  await ensureProductReviews();
  const fingerprint = reviewFingerprint(productId, input, userId);
  const requestFingerprint = createHash("sha256").update(JSON.stringify([fingerprint, editing, input.expectedRevision ?? null])).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-scoped lock serializes two tabs and concurrent retries for a
    // single customer/product without occupying a separate connection.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([userId, productId])]);
    if (!await hasQualifyingReviewPurchase(userId, productId, client)) {
      throw new ReviewPurchaseError("Only customers with a qualifying purchase can review this product.");
    }
    const previous = await client.query("SELECT user_id,product_id,fingerprint FROM product_review_submissions WHERE submission_id=$1", [input.submissionId]);
    if (previous.rowCount) {
      const saved = previous.rows[0];
      if (saved.user_id !== userId || saved.product_id !== productId || saved.fingerprint !== requestFingerprint) {
        throw new ReviewConflictError("This submission identifier was already used for different details.");
      }
      await client.query("COMMIT");
      return;
    }
    const current = await client.query("SELECT id,revision FROM product_reviews WHERE user_id=$1 AND product_id=$2 FOR UPDATE", [userId, productId]);
    let id: number;
    if (editing) {
      if (!current.rowCount) throw new OwnReviewNotFoundError("Your review could not be found.");
      if (current.rows[0].revision !== input.expectedRevision) {
        throw new ReviewConflictError("Your review changed in another tab. Reload your latest review before editing.");
      }
      id = current.rows[0].id;
      await client.query(`
        UPDATE product_reviews SET rating=$2,title=$3,body=$4,display_name=$5,
          submission_id=$6,fingerprint=$7,status='pending',moderated_at=NULL,revision=revision+1
        WHERE id=$1
      `, [id, input.rating, input.title, input.body, input.displayName, input.submissionId, fingerprint]);
    } else {
      if (current.rowCount) throw new ReviewConflictError("You have already reviewed this product. Choose Edit your review.");
      const inserted = await client.query(`
        INSERT INTO product_reviews(user_id,product_id,rating,title,body,display_name,submission_id,fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
      `, [userId, productId, input.rating, input.title, input.body, input.displayName, input.submissionId, fingerprint]);
      id = inserted.rows[0].id;
    }
    await client.query(`
      INSERT INTO product_review_submissions(submission_id,user_id,product_id,fingerprint,review_id)
      VALUES($1,$2,$3,$4,$5)
    `, [input.submissionId, userId, productId, requestFingerprint, id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") throw new ReviewConflictError("A review or submission already exists. Reload your review before retrying.");
    throw error;
  } finally {
    client.release();
  }
}

const publicColumns = `r.id, r.product_id AS "productId", r.rating, r.title, r.body, r.display_name AS "displayName", r.created_at AS "createdAt"`;
const publicPredicate = `r.status='approved' AND ${qualifyingReviewPurchase("r")}`;

export async function getOwnProductReview(userId: string, productId: number) {
  await ensureProductReviews();
  if (!await hasQualifyingReviewPurchase(userId, productId)) throw new ReviewPurchaseError("Only customers with a qualifying purchase can review this product.");
  const result = await pool.query(`
    SELECT ${publicColumns},true AS "verifiedPurchase",r.status,r.revision
    FROM product_reviews r WHERE r.user_id=$1 AND r.product_id=$2
  `, [userId, productId]);
  return { eligible: true, review: result.rows[0] ?? null };
}

export async function listProductReviews(productId: number, page: number) {
  await ensureProductReviews();
  // One statement/snapshot keeps the count, average, and page in agreement.
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM product_reviews r WHERE r.product_id=$1 AND ${publicPredicate}) AS total,
      (SELECT coalesce(round(avg(r.rating)::numeric,2),0)::float8 FROM product_reviews r WHERE r.product_id=$1 AND ${publicPredicate}) AS "averageRating",
      coalesce((SELECT json_agg(r) FROM (
        SELECT ${publicColumns},true AS "verifiedPurchase" FROM product_reviews r WHERE r.product_id=$1 AND ${publicPredicate}
        ORDER BY r.created_at DESC,r.id DESC LIMIT 10 OFFSET $2
      ) r),'[]'::json) AS reviews
  `, [productId, (page - 1) * 10]);
  return { ...result.rows[0], page, pageSize: 10 };
}

export async function listModerationReviews(status: ReviewStatus, page: number) {
  await ensureProductReviews();
  const result = await pool.query(`
    SELECT (SELECT count(*)::int FROM product_reviews WHERE status=$1) AS total,
    coalesce((SELECT json_agg(r) FROM (
      SELECT ${publicColumns}, r.status,(${qualifyingReviewPurchase("r")}) AS "verifiedPurchase",
        coalesce((SELECT p->>'name' FROM store_catalog c,jsonb_array_elements(c.products) p WHERE c.id=1 AND p->>'id'=r.product_id::text LIMIT 1),'Unavailable product') AS "productName"
      FROM product_reviews r WHERE r.status=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $2
    ) r),'[]'::json) AS reviews
  `, [status, (page - 1) * 20]);
  return { ...result.rows[0], page, pageSize: 20 };
}

export async function moderateReview(id: number, status: ReviewStatus) {
  await ensureProductReviews();
  const result = await pool.query(`
    UPDATE product_reviews r SET status=$2,moderated_at=now()
    WHERE r.id=$1 AND ($2 <> 'approved' OR (${qualifyingReviewPurchase("r")}))
    RETURNING r.id
  `, [id, status]);
  if (!result.rowCount && status === "approved") {
    const exists = await pool.query("SELECT 1 FROM product_reviews WHERE id=$1", [id]);
    if (exists.rowCount) throw new ReviewPurchaseError("This review has no qualifying purchase and cannot be approved.");
  }
  return result.rowCount === 1;
}

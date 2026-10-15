import { pool } from "@workspace/db";
import type { BrandingApproval, BrandingSample, BrandingTestStore } from "./emailBrandingTests";

export async function listBrandingSamples(key: string): Promise<BrandingSample[]> {
  const result = await pool.query(
    `SELECT variant, marker, message_id AS "messageId", subject, status
     FROM store_email_branding_tests WHERE approval_key=$1 ORDER BY created_at, variant`, [key]);
  return result.rows;
}
export const brandingTestStore: BrandingTestStore = {
  async reserve(approval: BrandingApproval, adminId: string, samples: BrandingSample[]) {
    // One statement inserts all five atomically; concurrent requests cannot split a batch.
    const result = await pool.query(
      `INSERT INTO store_email_branding_tests
       (approval_key, variant, recipient, marker, message_id, subject, status, admin_user_id)
       SELECT $1, s.variant, $2, s.marker, s.message_id, s.subject, 'reserved', $3
       FROM jsonb_to_recordset($4::jsonb) AS s(variant text, marker text, message_id text, subject text)
       ON CONFLICT DO NOTHING RETURNING variant`,
      [approval.key, approval.recipient, adminId, JSON.stringify(samples.map(s => ({
        variant: s.variant, marker: s.marker, message_id: s.messageId, subject: s.subject,
      })))]);
    return result.rowCount === samples.length;
  },
  async update(key, variant, status) {
    const result = await pool.query(
      "UPDATE store_email_branding_tests SET status=$3, updated_at=NOW() WHERE approval_key=$1 AND variant=$2",
      [key, variant, status]);
    if (result.rowCount !== 1) throw new Error("Synthetic email status could not be recorded.");
  },
};

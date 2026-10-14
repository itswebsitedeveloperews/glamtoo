import { pool, type PoolClient } from "@workspace/db";

// Serialize per-enquiry projections, including when different workers finish
// different recipients at the same time. Lock before changing any child jobs,
// then read their committed states in a separate statement in this transaction.
export async function changeContactJobs(
  enquiryId: number,
  change: (client: PoolClient) => Promise<{ rowCount: number | null }>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parent = await client.query("SELECT id FROM contact_enquiries WHERE id=$1 FOR UPDATE", [enquiryId]);
    if (!parent.rowCount) {
      await client.query("COMMIT");
      return { rowCount: 0 };
    }
    const result = await change(client);
    if (result.rowCount) {
      const jobs = await client.query<{ recipient: string; status: string; message_id: string; last_error: string | null }>(
        "SELECT recipient, status, message_id, last_error FROM contact_notification_jobs WHERE enquiry_id=$1 ORDER BY id", [enquiryId],
      );
      const outcomes = jobs.rows.map(job => ({
        email: job.recipient, status: job.status === "leased" ? "pending" : job.status,
        messageId: job.message_id, error: job.last_error,
      }));
      const status = outcomes.every(item => item.status === "accepted") ? "accepted"
        : outcomes.some(item => item.status === "sending") ? "sending"
        : outcomes.some(item => item.status === "pending") ? "pending"
        : outcomes.some(item => item.status === "accepted") ? "partial"
        : outcomes.some(item => item.status === "uncertain") ? "uncertain" : "failed";
      const error = status === "accepted" || status === "sending" ? null
        : outcomes.find(item => item.error)?.error ?? null;
      await client.query(
        "UPDATE contact_enquiries SET delivery_status=$2, delivery_error=$3, email_recipients=$4::jsonb WHERE id=$1",
        [enquiryId, status, error, JSON.stringify(outcomes)],
      );
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

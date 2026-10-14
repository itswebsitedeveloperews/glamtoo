import { randomUUID } from "node:crypto";
import { contactEnquiriesTable, contactNotificationJobsTable, contactNotificationSettingsTable, db, pool, type ContactEnquiry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { gmailSmtpConfiguration, sendGmailContactNotification, GmailSmtpError } from "./gmailSmtp";
import { logger } from "./lib/logger";
import { configuredAdminEmails } from "./adminAuth";
import { changeContactJobs } from "./contactNotificationState";

const MAX_ATTEMPTS = 5;
const UNCERTAIN = "SMTP outcome is unknown. Reconcile the saved Message-ID before resending.";

export async function getContactNotificationSettings() {
  const [saved] = await db.select().from(contactNotificationSettingsTable).where(eq(contactNotificationSettingsTable.id, 1));
  const adminEmails = saved?.adminEmails?.length ? saved.adminEmails : saved?.adminEmail ? [saved.adminEmail] : [];
  return {
    adminEmail: saved?.adminEmail ?? "", adminEmails,
    orderAdminEmails: saved?.orderAdminEmails ?? [],
    fallbackAdminEmail: saved?.fallbackAdminEmail || [...configuredAdminEmails()][0] || "",
    enabled: saved?.enabled ?? false, orderEnabled: saved?.orderEnabled ?? false,
  };
}

// No network calls here: success commits the full enquiry and, only when
// explicitly enabled at submission, its immutable recipient and Message-ID.
export async function storeContactEnquiry(input: Pick<ContactEnquiry, "name" | "email" | "orderNumber" | "topic" | "message">) {
  return db.transaction(async (tx) => {
    const [settings] = await tx.select().from(contactNotificationSettingsTable).where(eq(contactNotificationSettingsTable.id, 1));
    const emails = settings?.adminEmails?.length ? settings.adminEmails
      : settings?.adminEmail ? [settings.adminEmail]
      : [settings?.fallbackAdminEmail || [...configuredAdminEmails()][0] || ""];
    const recipients = [...new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))];
    const enabled = settings?.enabled && recipients.length > 0;
    const outcomes = enabled ? recipients.map(email => ({
      email, status: "pending", messageId: `<glam-too-contact-${randomUUID()}@notifications.glamtoo.invalid>`, error: null,
    })) : [];
    const [enquiry] = await tx.insert(contactEnquiriesTable).values({
      ...input, emailMessageId: outcomes[0]?.messageId ?? null, emailRecipients: outcomes,
      deliveryStatus: enabled ? "pending" : "not_configured",
      deliveryError: enabled ? null : "Admin enquiry email notifications are disabled or no recipient is configured.",
    }).returning();
    if (enabled) await tx.insert(contactNotificationJobsTable).values(outcomes.map(outcome => ({
      enquiryId: enquiry.id, recipient: outcome.email, messageId: outcome.messageId,
    })));
    return enquiry;
  });
}

type Job = { id: number; enquiry_id: number; recipient: string; message_id: string; attempts: number; lease_token: string };

// Both records move together, and a stale worker can never overwrite a newer
// lease or reconcile a send after another worker froze its ambiguous outcome.
async function finish(job: Job, status: string, error: string | null, delay = 0, expected = "sending") {
  return changeContactJobs(job.enquiry_id, client => client.query(
    `UPDATE contact_notification_jobs SET status=$3, last_error=$4,
         next_attempt_at=NOW()+make_interval(secs => $5), lease_token=NULL, lease_expires_at=NULL, updated_at=NOW()
       WHERE id=$1 AND lease_token=$2 AND status=$6`,
    [job.id, job.lease_token, status, error, delay, expected],
  ));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function buildMessage(enquiry: ContactEnquiry) {
  const fields = [
    ["Enquiry", String(enquiry.id)], ["Name", enquiry.name], ["Email", enquiry.email],
    ...(enquiry.orderNumber ? [["Order number", enquiry.orderNumber]] : []),
    ["Topic", enquiry.topic], ["Message", enquiry.message],
  ];
  return {
    subject: `Glam Too contact enquiry #${enquiry.id}`,
    text: fields.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: "<h1>New Glam Too customer enquiry</h1>" + fields.map(([label, value]) =>
      `<p><strong>${label}:</strong> ${escapeHtml(value).replaceAll("\n", "<br>")}</p>`).join(""),
  };
}

export async function processContactNotifications(limit = 10) {
  // Expired pre-send claims are safe to recover. Expired sending leases are
  // not: the process may have died after Gmail accepted DATA.
  const expired = await pool.query<{ enquiry_id: number }>(
    "SELECT DISTINCT enquiry_id FROM contact_notification_jobs WHERE status IN ('leased','sending') AND lease_expires_at<=NOW()",
  );
  for (const row of expired.rows) await changeContactJobs(row.enquiry_id, client => client.query(
    `UPDATE contact_notification_jobs SET
         status=CASE WHEN status='leased' THEN 'pending' ELSE 'uncertain' END,
         last_error=CASE WHEN status='leased' THEN NULL ELSE $1 END,
         lease_token=NULL, lease_expires_at=NULL, updated_at=NOW()
       WHERE enquiry_id=$2 AND status IN ('leased','sending') AND lease_expires_at <= NOW()`,
    [UNCERTAIN, row.enquiry_id],
  ));
  // Disabling pauses unsent jobs, but never retargets or creates jobs.
  if (!(await getContactNotificationSettings()).enabled) return;
  for (let index = 0; index < Math.min(limit, 100); index++) {
    const result = await pool.query<Job>(
      `WITH candidate AS (
         SELECT id FROM contact_notification_jobs
         WHERE status='pending' AND next_attempt_at<=NOW() AND attempts<$1
         ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE contact_notification_jobs j SET status='leased', lease_token=$2,
         lease_expires_at=NOW()+INTERVAL '5 minutes', updated_at=NOW()
       FROM candidate c WHERE j.id=c.id RETURNING j.*`,
      [MAX_ATTEMPTS, randomUUID()],
    );
    const job = result.rows[0];
    if (!job) break;
    let smtp;
    try { smtp = await gmailSmtpConfiguration(); }
    catch {
      await finish(job, "pending", "Gmail configuration could not be loaded; retry scheduled.", 300, "leased");
      continue;
    }
    if (!smtp) {
      await finish(job, "pending", "Gmail credentials or mailbox authorization are not configured.", 300, "leased");
      continue;
    }
    const [enquiry] = await db.select().from(contactEnquiriesTable).where(eq(contactEnquiriesTable.id, job.enquiry_id));
    if (!enquiry) continue; // Cascade-deleted jobs cannot send.
    const message = buildMessage(enquiry);
    // Persist the ambiguity boundary BEFORE any SMTP activity. Token + expiry
    // fencing prevents a recovered pre-send lease's old owner from sending.
    const started = await changeContactJobs(job.enquiry_id, client => client.query(
      `UPDATE contact_notification_jobs SET status='sending', attempts=attempts+1, last_error=NULL, updated_at=NOW()
         WHERE id=$1 AND lease_token=$2 AND status='leased' AND lease_expires_at>NOW()`,
      [job.id, job.lease_token],
    ));
    if (!started.rowCount) continue;
    job.attempts++;
    try {
      await sendGmailContactNotification(smtp, enquiry.id, job.recipient, enquiry.email, message, job.message_id);
    } catch (error) {
      const failure = error instanceof GmailSmtpError ? error : new GmailSmtpError("uncertain", UNCERTAIN);
      const status = failure.kind === "retry" && job.attempts < MAX_ATTEMPTS ? "pending"
        : failure.kind === "uncertain" ? "uncertain" : "failed";
      await finish(job, status, failure.message, Math.min(1800, 60 * 2 ** (job.attempts - 1)));
      continue;
    }
    // If saving acceptance fails, leave 'sending' for expiry/reconciliation,
    // never misclassify that database failure as safely retryable SMTP.
    const saved = await finish(job, "accepted", null);
    if (saved.rowCount) logger.info({ enquiryId: job.enquiry_id }, "Contact alert accepted by SMTP; inbox delivery is not confirmed");
  }
}

export function startContactNotificationWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processContactNotifications(); }
    catch { logger.error("Contact alert worker interrupted; enquiries and notification jobs remain stored"); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}

import { contactEnquiriesTable, contactNotificationSettingsTable, db, type ContactEnquiry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { gmailSmtpConfiguration, gmailContactMessageId, sendGmailContactNotification, GmailSmtpError } from "./gmailSmtp";
import { configuredAdminEmails } from "./adminAuth";

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
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export async function notifyContactAdmin(enquiry: ContactEnquiry) {
  const update = (deliveryStatus: string, deliveryError: string | null, emailMessageId?: string) =>
    db.update(contactEnquiriesTable).set({ deliveryStatus, deliveryError, ...(emailMessageId ? { emailMessageId } : {}) })
      .where(eq(contactEnquiriesTable.id, enquiry.id));
  try {
    const settings = await getContactNotificationSettings();
    const recipients = settings.adminEmails.length ? settings.adminEmails : settings.fallbackAdminEmail ? [settings.fallbackAdminEmail] : [];
    if (!settings.enabled || !recipients.length) {
      await update("not_configured", "Admin enquiry email notifications are disabled or no recipient is configured.");
      return;
    }
    const smtp = await gmailSmtpConfiguration();
    if (!smtp) {
      await update("not_configured", "Gmail credentials or mailbox authorization are not configured.");
      return;
    }
    const outcomes = recipients.map(email => ({
      email, status: "pending", messageId: gmailContactMessageId(smtp, enquiry.id, email), error: null as string | null,
    }));
    // Save the identifier before SMTP so an ambiguous outcome can be reconciled,
    // without automatically sending a duplicate.
    await db.update(contactEnquiriesTable).set({ deliveryStatus: "sending", emailMessageId: outcomes[0].messageId, emailRecipients: outcomes })
      .where(eq(contactEnquiriesTable.id, enquiry.id));
    const text = [
      `Enquiry: ${enquiry.id}`, `Name: ${enquiry.name}`, `Email: ${enquiry.email}`,
      enquiry.orderNumber ? `Order number: ${enquiry.orderNumber}` : "",
      `Topic: ${enquiry.topic}`, "", enquiry.message,
    ].filter(Boolean).join("\n");
    const html = [
      "<h1>New Glam Too customer enquiry</h1>",
      `<p><strong>Enquiry:</strong> ${enquiry.id}</p>`,
      `<p><strong>Name:</strong> ${escapeHtml(enquiry.name)}</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(enquiry.email)}</p>`,
      enquiry.orderNumber ? `<p><strong>Order number:</strong> ${escapeHtml(enquiry.orderNumber)}</p>` : "",
      `<p><strong>Topic:</strong> ${escapeHtml(enquiry.topic)}</p>`,
      `<p><strong>Message:</strong><br>${escapeHtml(enquiry.message).replaceAll("\n", "<br>")}</p>`,
    ].join("");
    for (const outcome of outcomes) {
      outcome.status = "sending";
      await db.update(contactEnquiriesTable).set({ emailRecipients: outcomes }).where(eq(contactEnquiriesTable.id, enquiry.id));
      try {
        await sendGmailContactNotification(smtp, enquiry.id, outcome.email, enquiry.email, {
          subject: `Glam Too contact enquiry #${enquiry.id}`, text, html,
        });
        outcome.status = "accepted";
      } catch (error) {
        outcome.status = error instanceof GmailSmtpError && error.kind === "uncertain" ? "uncertain" : "failed";
        outcome.error = outcome.status === "uncertain" ? "SMTP outcome unknown; reconcile this Message-ID before resending." : "Gmail could not accept this recipient's alert.";
      }
      await db.update(contactEnquiriesTable).set({ emailRecipients: outcomes }).where(eq(contactEnquiriesTable.id, enquiry.id));
    }
    // SMTP acceptance is not recipient-inbox delivery.
    const status = outcomes.every(item => item.status === "accepted") ? "accepted"
      : outcomes.some(item => item.status === "accepted") ? "partial"
      : outcomes.some(item => item.status === "uncertain") ? "uncertain" : "failed";
    await update(status, status === "accepted" ? null : "One or more recipient alerts were not confirmed accepted. Check the individual outcomes.");
  } catch (error) {
    const uncertain = error instanceof GmailSmtpError && error.kind === "uncertain";
    await update(uncertain ? "uncertain" : "failed", uncertain
      ? "SMTP outcome is unknown. Reconcile the saved Message-ID before resending."
      : "The admin email could not be accepted. The enquiry remains available in the admin inbox.");
  }
}

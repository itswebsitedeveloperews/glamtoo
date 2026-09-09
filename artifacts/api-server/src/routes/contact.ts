import { Router, type IRouter, type Request } from "express";
import {
  SubmitContactEnquiryBody,
  SubmitContactEnquiryResponse,
} from "@workspace/api-zod";
import { contactEnquiriesTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const submissionWindows = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clientKey(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function isRateLimited(request: Request) {
  const key = clientKey(request);
  const cutoff = Date.now() - WINDOW_MS;
  const recent = (submissionWindows.get(key) ?? []).filter((time) => time > cutoff);
  if (recent.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    submissionWindows.set(key, recent);
    return true;
  }
  submissionWindows.set(key, [...recent, Date.now()]);
  return false;
}

function mailerSendConfig() {
  const token = process.env.MAILERSEND_API_TOKEN?.trim();
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL?.trim();
  const fromName = process.env.MAILERSEND_FROM_NAME?.trim() || "Glam Too";
  const adminEmail = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .find(Boolean);
  return token && fromEmail && adminEmail
    ? { token, fromEmail, fromName, adminEmail }
    : null;
}

router.post("/contact-enquiries", async (request, response): Promise<void> => {
  if (isRateLimited(request)) {
    response.status(429).json({ error: "Too many messages were sent. Please wait a few minutes and try again." });
    return;
  }

  const parsed = SubmitContactEnquiryBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the form details and try again." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const name = parsed.data.name.trim();
  const order = parsed.data.order?.trim();
  let enquiryId: number;
  try {
    const [enquiry] = await db.insert(contactEnquiriesTable).values({
      name,
      email,
      orderNumber: order || null,
      topic: parsed.data.topic,
      message: parsed.data.message.trim(),
    }).returning({ id: contactEnquiriesTable.id });
    enquiryId = enquiry.id;
  } catch (error) {
    request.log.error({ error }, "Contact enquiry could not be stored");
    response.status(503).json({ error: "Your message could not be submitted. Please try again." });
    return;
  }

  const successResponse = SubmitContactEnquiryResponse.parse({
    sent: true,
    message: "Thanks — your message has been submitted successfully.",
  });
  const config = mailerSendConfig();
  if (!config) {
    await db.update(contactEnquiriesTable).set({
      deliveryStatus: "not_configured",
      deliveryError: "MailerSend is not configured",
    }).where(eq(contactEnquiriesTable.id, enquiryId));
    request.log.warn({ enquiryId }, "Contact enquiry stored; email delivery is not configured");
    response.json(successResponse);
    return;
  }

  const subject = `Glam Too enquiry: ${parsed.data.topic}${order ? ` (${order})` : ""}`;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    order ? `Order number: ${order}` : "",
    `Topic: ${parsed.data.topic}`,
    "",
    parsed.data.message.trim(),
  ].filter(Boolean).join("\n");
  const html = [
    "<h1>New Glam Too customer enquiry</h1>",
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
    order ? `<p><strong>Order number:</strong> ${escapeHtml(order)}</p>` : "",
    `<p><strong>Topic:</strong> ${escapeHtml(parsed.data.topic)}</p>`,
    `<p><strong>Message:</strong><br>${escapeHtml(parsed.data.message.trim()).replaceAll("\n", "<br>")}</p>`,
  ].join("");

  try {
    const mailResponse = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: config.fromEmail, name: config.fromName },
        to: [{ email: config.adminEmail, name: "Glam Too admin" }],
        reply_to: { email, name },
        subject,
        text,
        html,
      }),
    });

    if (!mailResponse.ok) {
      await db.update(contactEnquiriesTable).set({
        deliveryStatus: "failed",
        deliveryError: `MailerSend HTTP ${mailResponse.status}`,
      }).where(eq(contactEnquiriesTable.id, enquiryId));
      request.log.error({ enquiryId, status: mailResponse.status }, "MailerSend rejected stored contact enquiry");
      response.json(successResponse);
      return;
    }

    await db.update(contactEnquiriesTable).set({
      deliveryStatus: "delivered",
      deliveryError: null,
      deliveredAt: new Date(),
    }).where(eq(contactEnquiriesTable.id, enquiryId));
    response.json(successResponse);
  } catch (error) {
    await db.update(contactEnquiriesTable).set({
      deliveryStatus: "failed",
      deliveryError: "MailerSend request failed",
    }).where(eq(contactEnquiriesTable.id, enquiryId));
    request.log.error({ enquiryId, error }, "Stored contact enquiry delivery failed");
    response.json(successResponse);
  }
});

export default router;
import { Router, type IRouter, type Request } from "express";
import {
  SubmitContactEnquiryBody,
  SubmitContactEnquiryResponse,
} from "@workspace/api-zod";
import { contactEnquiriesTable, db } from "@workspace/db";
import { notifyContactAdmin } from "../contactNotifications";

const router: IRouter = Router();
const submissionWindows = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

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
  let enquiry: typeof contactEnquiriesTable.$inferSelect;
  try {
    [enquiry] = await db.insert(contactEnquiriesTable).values({
      name,
      email,
      orderNumber: order || null,
      topic: parsed.data.topic,
      message: parsed.data.message.trim(),
    }).returning();
  } catch (error) {
    request.log?.error("Contact enquiry could not be stored");
    response.status(503).json({ error: "Your message could not be submitted. Please try again." });
    return;
  }

  const successResponse = SubmitContactEnquiryResponse.parse({
    sent: true,
    message: "Thanks — your message has been submitted successfully.",
  });
  // The customer gets success as soon as the message is durably stored.
  // SMTP cannot delay that response or turn a saved enquiry into a failure.
  response.json(successResponse);
  try {
    await notifyContactAdmin(enquiry);
  } catch (error) {
    request.log?.warn({ enquiryId: enquiry.id }, "Stored contact enquiry email status could not be updated");
  }
});

export default router;
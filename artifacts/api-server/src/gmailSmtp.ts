import nodemailer from "nodemailer";

export function gmailSmtpConfiguration() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const password = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || !password) return null;
  return {
    user, password,
    fromName: process.env.GMAIL_SMTP_FROM_NAME?.trim() || "Glam Too Boutique",
    replyTo: process.env.GMAIL_SMTP_REPLY_TO_EMAIL?.trim() || user,
  };
}

export class GmailSmtpError extends Error {
  constructor(public readonly kind: "retry" | "failed" | "uncertain", message: string) { super(message); }
}

export function gmailOrderMessageId(config: { user: string }, orderId: string) {
  return `<glam-too-order-${orderId.replace(/[^a-zA-Z0-9_-]/g, "")}@${config.user.split("@")[1]}>`;
}

function transport(config: NonNullable<ReturnType<typeof gmailSmtpConfiguration>>) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    logger: false, debug: false,
  });
}

export async function sendGmailConfirmation(
  config: NonNullable<ReturnType<typeof gmailSmtpConfiguration>>,
  order: { id: string; email: string },
  message: { subject: string; html: string; text: string },
) {
  const client = transport(config);
  try {
    const result = await client.sendMail({
      // The authenticated mailbox is the sender: no unverified branded spoofing.
      from: { name: config.fromName, address: config.user },
      replyTo: config.replyTo,
      to: order.email,
      envelope: { from: config.user, to: [order.email] },
      messageId: gmailOrderMessageId(config, order.id),
      headers: { "X-Glam-Too-Order": order.id },
      ...message,
    });
    const accepted = result.accepted?.some((address) => address.toLowerCase() === order.email.toLowerCase());
    if (!accepted || !result.messageId || !/^2\d\d\b/.test(result.response)) {
      throw new GmailSmtpError("uncertain", "SMTP acceptance could not be verified; reconcile the Message-ID before resending.");
    }
    // A successful SMTP transaction means accepted, never inbox-delivered.
    return result.messageId;
  } catch (error) {
    if (error instanceof GmailSmtpError) throw error;
    const failure = (error && typeof error === "object" ? error : {}) as {
      responseCode?: number; code?: string; originalCode?: string; timeoutType?: string;
    };
    if (failure.responseCode && failure.responseCode >= 400 && failure.responseCode < 500) {
      throw new GmailSmtpError("retry", `Gmail temporarily rejected the message (SMTP ${failure.responseCode}).`);
    }
    if (failure.code === "EAUTH" || (failure.responseCode && failure.responseCode >= 500)) {
      throw new GmailSmtpError("failed", "Gmail rejected authentication or the message; check the App Password and account restrictions.");
    }
    // Nodemailer also reports post-DATA socket errors as command CONN. That
    // label is not evidence that a message was never sent.
    if (failure.code === "EDNS"
      || failure.originalCode === "ECONNREFUSED"
      || ["CONNECT_TIMEOUT", "GREETING_TIMEOUT"].includes(failure.timeoutType ?? "")) {
      throw new GmailSmtpError("retry", "Could not connect to Gmail before sending; retry scheduled.");
    }
    // A disconnect during/after DATA can follow acceptance. SMTP has no
    // idempotency key; duplicate prevention requires manual reconciliation here.
    throw new GmailSmtpError("uncertain", "SMTP outcome is unknown; reconcile the Message-ID in Gmail before resending.");
  } finally { client.close(); }
}

export async function verifyGmailSmtp() {
  const config = gmailSmtpConfiguration();
  if (!config) throw new Error("Gmail SMTP credentials are not configured.");
  const client = transport(config);
  try { return await client.verify(); }
  catch { throw new Error("Gmail SMTP verification failed; check account settings and secure credentials."); }
  finally { client.close(); }
}

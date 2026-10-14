import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import { gmailOAuthClient, gmailUsesOAuth, getGmailRefreshToken } from "./gmailOAuthCredentials";

export type GmailSmtpConfig = {
  user: string; fromName: string; replyTo: string; mode: "app_password" | "oauth2";
  password?: string; clientId?: string; clientSecret?: string; refreshToken?: string;
  authorizedSince?: Date;
};

export async function gmailSmtpConfiguration(): Promise<GmailSmtpConfig | null> {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const password = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return null;
  if (gmailUsesOAuth()) {
    const client = gmailOAuthClient();
    if (!client) return null;
    const refreshToken = await getGmailRefreshToken(client);
    if (!refreshToken) return null;
    return {
      user, mode: "oauth2", clientId: client.clientId, clientSecret: client.clientSecret,
      refreshToken: refreshToken.token, authorizedSince: refreshToken.enabledAt,
      fromName: process.env.GMAIL_SMTP_FROM_NAME?.trim() || "Glam Too Boutique",
      replyTo: process.env.GMAIL_SMTP_REPLY_TO_EMAIL?.trim() || user,
    };
  }
  if (!password) return null;
  return {
    user, password, mode: "app_password",
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

function transport(config: GmailSmtpConfig) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: config.mode === "oauth2"
      ? { type: "OAuth2", user: config.user, clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: config.refreshToken }
      : { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    logger: false, debug: false,
  });
}

export async function sendGmailConfirmation(
  config: GmailSmtpConfig,
  order: { id: string; email: string },
  message: { subject: string; html: string; text: string },
) {
  return sendGmailMessage(config, order.email, message, gmailOrderMessageId(config, order.id), { "X-Glam-Too-Order": order.id });
}

export function gmailContactMessageId(config: { user: string }, enquiryId: number, recipient?: string) {
  const suffix = recipient ? `-${createHash("sha256").update(recipient.toLowerCase()).digest("hex").slice(0, 20)}` : "";
  return `<glam-too-contact-${enquiryId}${suffix}@${config.user.split("@")[1]}>`;
}

export async function sendGmailContactNotification(
  config: GmailSmtpConfig, enquiryId: number, adminEmail: string, customerEmail: string,
  message: { subject: string; html: string; text: string },
  messageId = gmailContactMessageId(config, enquiryId, adminEmail),
) {
  return sendGmailMessage(config, adminEmail, message, messageId,
    { "X-Glam-Too-Enquiry": String(enquiryId) }, customerEmail);
}

export function gmailAdminOrderMessageId(config: { user: string }, orderId: string, recipient: string) {
  const hash = createHash("sha256").update(recipient.toLowerCase()).digest("hex").slice(0, 20);
  return gmailOrderMessageId(config, `${orderId}-admin-${hash}`);
}
export async function sendGmailAdminOrderConfirmation(config: GmailSmtpConfig, orderId: string, recipient: string,
  message: { subject: string; html: string; text: string }) {
  return sendGmailMessage(config, recipient, { ...message, subject: `Admin copy — ${message.subject}` },
    gmailAdminOrderMessageId(config, orderId, recipient), { "X-Glam-Too-Order": orderId, "X-Glam-Too-Audience": "admin" });
}

async function sendGmailMessage(
  config: GmailSmtpConfig, recipient: string, message: { subject: string; html: string; text: string },
  messageId: string, headers: Record<string, string>, replyTo = config.replyTo,
) {
  const client = transport(config);
  try {
    const result = await client.sendMail({
      // The authenticated mailbox is the sender: no unverified branded spoofing.
      from: { name: config.fromName, address: config.user },
      replyTo,
      to: recipient,
      envelope: { from: config.user, to: [recipient] },
      messageId,
      headers,
      ...message,
    });
    const accepted = result.accepted?.some((address) => address.toLowerCase() === recipient.toLowerCase());
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
      throw new GmailSmtpError("failed", "Gmail rejected authentication or the message; reconnect Google OAuth or check the App Password and account restrictions.");
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

export async function verifyGmailSmtp(override?: GmailSmtpConfig) {
  const config = override ?? await gmailSmtpConfiguration();
  if (!config) throw new GmailSmtpError("failed", "Gmail SMTP credentials or Google mailbox authorization are not configured.");
  const client = transport(config);
  try { return await client.verify(); }
  catch (error) {
    const failure = (error && typeof error === "object" ? error : {}) as { code?: string; responseCode?: number };
    const knownCodes = ["EAUTH", "ETIMEDOUT", "EDNS", "ESOCKET", "ECONNECTION", "ETLS"];
    const code = knownCodes.includes(failure.code ?? "") ? failure.code : "UNKNOWN";
    const status = Number.isInteger(failure.responseCode) && failure.responseCode! >= 400 && failure.responseCode! <= 599
      ? `, SMTP ${failure.responseCode}` : "";
    // Diagnostic codes only: raw SMTP responses can include the mailbox.
    throw new GmailSmtpError("failed", `Gmail SMTP verification failed (${code}${status}); check account settings and secure credentials.`);
  }
  finally { client.close(); }
}

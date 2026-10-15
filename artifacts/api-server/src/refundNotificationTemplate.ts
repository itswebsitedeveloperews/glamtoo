import { brandedEmailDocument, EMAIL_BRAND, escapeEmailHtml as e } from "./emailBranding";

export type RefundNotificationType = "refund_processing" | "refunded" | "manual_resolution";

function notificationCopy(type: RefundNotificationType, orderNumber: string) {
  if (type === "refunded") return {
    subject: `Your Glam Too refund is complete (${orderNumber})`,
    heading: "Your refund is complete",
    detail: "We have completed your full refund. Your bank may take a few working days to show the money in your account.",
  };
  if (type === "manual_resolution") return {
    subject: `Your Glam Too payment needs our attention (${orderNumber})`,
    heading: "We’re resolving your payment",
    detail: "Your payment arrived after this order had been cancelled. Our customer-care team is completing the refund manually and will contact you if anything else is needed.",
  };
  return {
    subject: `Your Glam Too refund is being processed (${orderNumber})`,
    heading: "Your refund is being processed",
    detail: "Your payment arrived after this order had been cancelled. We are processing your full refund now, and your bank may take a few working days to show it.",
  };
}

/** Pure rendering only; does not queue, send, retry or enable refund emails. */
export function buildRefundNotificationMessage(type: RefundNotificationType, orderId: string, customerName: string) {
  const orderNumber = `#GM-${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;
  const copy = notificationCopy(type, orderNumber);
  const greeting = `Hi ${customerName.trim() || "there"},`;
  const explanation = `Order ${orderNumber} will not be fulfilled because it was cancelled after the availability reserved for it had changed.`;
  const support = "If you have any questions, please reply to this email or contact hello@glamtoo.co.uk.";
  const text = [EMAIL_BRAND.name, EMAIL_BRAND.tagline, "", greeting, "", copy.heading, "",
    explanation, copy.detail, "", support, "", EMAIL_BRAND.name].join("\n");
  const branding = brandedEmailDocument({
    subject: copy.subject,
    preheader: `${copy.heading}. Order ${orderNumber}.`,
    logoCid: "glam-too-refund-wordmark",
    footerNote: "Customer care · hello@glamtoo.co.uk",
    content: `<tr><td align="left" style="padding:32px 28px;">
<p style="margin:0 0 10px;font-size:14px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b12d5c;">Customer care</p>
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:400;color:#171615;">${e(copy.heading)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:24px;">${e(greeting)}</p>
<p style="margin:0 0 20px;padding:14px 16px;background-color:#f9e8ee;border-left:3px solid #c96381;font-size:16px;line-height:24px;overflow-wrap:break-word;">${e(explanation)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;">${e(copy.detail)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${EMAIL_BRAND.button}" style="background-color:${EMAIL_BRAND.button};mso-padding-alt:14px 24px;">
<a href="mailto:hello@glamtoo.co.uk" style="display:inline-block;padding:14px 24px;background-color:${EMAIL_BRAND.button};border:1px solid ${EMAIL_BRAND.button};color:#ffffff;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;">Contact customer care</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:14px;line-height:22px;color:#625b56;">${e(support)}</p>
</td></tr>`,
  });
  return { subject: copy.subject, text, ...branding };
}

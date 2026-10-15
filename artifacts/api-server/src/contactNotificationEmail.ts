import type { ContactEnquiry } from "@workspace/db";
import { brandedEmailDocument, EMAIL_BRAND } from "./emailBranding";

type EnquiryDetails = Pick<ContactEnquiry, "id" | "name" | "email" | "orderNumber" | "topic" | "message">;
const LOGO_CID = "glam-too-contact-wordmark";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Pure rendering: no provider, database, recipient settings or delivery effects. */
export function buildContactNotificationMessage(enquiry: EnquiryDetails) {
  const fields = [
    ["Enquiry", String(enquiry.id)], ["Name", enquiry.name], ["Email", enquiry.email],
    ...(enquiry.orderNumber ? [["Order number", enquiry.orderNumber]] : []),
    ["Topic", enquiry.topic], ["Message", enquiry.message],
  ];
  const replyUrl = escapeHtml(`mailto:${encodeURIComponent(enquiry.email)}?subject=${encodeURIComponent(`Re: ${enquiry.topic}`)}`);
  const details = fields.slice(1, -1).map(([label, value]) => `
    <tr>
      <th scope="row" align="left" valign="top" width="30%" style="padding:13px 12px 13px 0;border-bottom:1px solid #e8e1dc;font-size:14px;line-height:22px;font-weight:400;color:#625b56;">${label}</th>
      <td align="left" valign="top" style="padding:13px 0;border-bottom:1px solid #e8e1dc;font-size:16px;line-height:24px;word-wrap:break-word;word-break:break-word;">${escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>")}</td>
    </tr>`).join("");
  const subject = `Glam Too contact enquiry #${enquiry.id}`;
  const branding = brandedEmailDocument({
    subject,
    preheader: `New customer enquiry #${enquiry.id} · ${enquiry.topic}`,
    logoCid: LOGO_CID,
    footerNote: "Private admin notification. No automatic reply was sent to the customer.",
    content: `<tr><td align="left" style="padding:28px 24px;">
          <p style="margin:0 0 10px;font-size:14px;line-height:20px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#625b56;">Customer care</p>
          <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:400;color:#171615;">New customer enquiry</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:24px;color:#625b56;">A customer has sent a message through the Glam Too contact form.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f9e8ee" style="padding:6px 12px;background-color:#f9e8ee;border-left:3px solid #c96381;font-size:14px;line-height:22px;color:#171615;">Enquiry <strong>#${enquiry.id}</strong></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" aria-label="Customer enquiry details" style="width:100%;table-layout:fixed;margin-top:12px;border-collapse:collapse;color:#171615;">
            ${details}
          </table>
          <h2 style="margin:26px 0 12px;font-size:18px;line-height:26px;font-weight:600;color:#171615;">Message</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
            <tr><td bgcolor="#f7f2ee" style="padding:18px;background-color:#f7f2ee;border-left:3px solid #c96381;font-size:16px;line-height:26px;word-wrap:break-word;word-break:break-word;color:#171615;">${escapeHtml(enquiry.message).replace(/\r\n|\r|\n/g, "<br>")}</td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td align="center" bgcolor="#e23d6f" style="background-color:#e23d6f;mso-padding-alt:13px 22px;">
            <a href="${replyUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #e23d6f;background-color:#e23d6f;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;font-weight:600;letter-spacing:1px;text-decoration:none;mso-padding-alt:0;">REPLY TO CUSTOMER</a>
          </td></tr></table>
          <p style="margin:16px 0 0;font-size:14px;line-height:22px;color:#625b56;">You can also reply directly to this email. The enquiry is saved in your admin Contact Form inbox.</p>
        </td></tr>`,
  });
  return {
    subject,
    text: [EMAIL_BRAND.name, EMAIL_BRAND.tagline, "", ...fields.map(([label, value]) => `${label}: ${value}`)].join("\n"),
    ...branding,
  };
}

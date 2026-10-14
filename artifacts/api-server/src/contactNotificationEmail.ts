import type { ContactEnquiry } from "@workspace/db";
import wordmark from "./assets/email-wordmark.png";

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
  return {
    subject: `Glam Too contact enquiry #${enquiry.id}`,
    text: fields.map(([label, value]) => `${label}: ${value}`).join("\n"),
    attachments: [{
      filename: "glam-too-boutique.png",
      content: Buffer.from(wordmark, "base64"),
      contentType: "image/png",
      contentDisposition: "inline" as const,
      cid: LOGO_CID,
    }],
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Glam Too contact enquiry #${enquiry.id}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f1ed;color:#171615;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all;">New customer enquiry #${enquiry.id} &middot; ${escapeHtml(enquiry.topic)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f1ed" style="width:100%;background-color:#f5f1ed;">
    <tr><td align="center" style="padding:28px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #d8d0ca;">
        <tr><td height="4" bgcolor="#c96381" style="height:4px;font-size:0;line-height:0;background-color:#c96381;">&nbsp;</td></tr>
        <tr><td align="center" bgcolor="#f5f1ed" style="padding:22px 24px 18px;background-color:#f5f1ed;border-bottom:1px solid #e8e1dc;">
          <img src="cid:${LOGO_CID}" alt="Glam Too Boutique" width="220" height="63" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;border:0;color:#171615;font-family:Georgia,serif;font-size:24px;">
        </td></tr>
        <tr><td align="left" style="padding:28px 24px;">
          <p style="margin:0 0 10px;font-size:14px;line-height:20px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#625b56;">Customer care</p>
          <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:36px;font-weight:400;color:#171615;">New customer enquiry</h1>
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
        </td></tr>
        <tr><td align="center" bgcolor="#f5f1ed" style="padding:20px 24px;background-color:#f5f1ed;border-top:1px solid #e8e1dc;font-size:14px;line-height:22px;color:#625b56;">
          <p style="margin:0 0 4px;color:#171615;">Glam Too Boutique &middot; Customer care</p>
          <p style="margin:0;">Private admin notification. No automatic reply was sent to the customer.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
  };
}

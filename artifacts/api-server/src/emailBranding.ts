import wordmark from "./assets/email-wordmark.png";

export const EMAIL_BRAND = {
  name: "Glam Too Boutique",
  tagline: "Outfits that make every moment yours.",
  background: "#f5f1ed",
  accent: "#c96381",
  button: "#e23d6f",
} as const;

export const escapeEmailHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

/** Trusted template content only; escape customer values before inserting them. */
export function brandedEmailDocument(options: {
  subject: string;
  preheader: string;
  content: string;
  logoCid: string;
  footerNote: string;
}) {
  const e = escapeEmailHtml;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(options.subject)}</title></head>
<body style="margin:0;padding:0;background-color:${EMAIL_BRAND.background};color:#171615;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all;">${e(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_BRAND.background}" style="width:100%;background-color:${EMAIL_BRAND.background};">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="width:100%;max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #d8d0ca;">
<tr><td height="4" bgcolor="${EMAIL_BRAND.accent}" style="height:4px;font-size:0;line-height:0;background-color:${EMAIL_BRAND.accent};">&nbsp;</td></tr>
<tr><td align="center" bgcolor="${EMAIL_BRAND.background}" style="padding:26px 24px 20px;background-color:${EMAIL_BRAND.background};border-bottom:1px solid #e8e1dc;">
<img src="cid:${e(options.logoCid)}" alt="${EMAIL_BRAND.name}" width="220" height="63" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;border:0;color:#171615;font-family:Georgia,serif;font-size:24px;"></td></tr>
${options.content}
<tr><td align="center" bgcolor="${EMAIL_BRAND.background}" style="padding:20px 24px;background-color:${EMAIL_BRAND.background};border-top:1px solid #e8e1dc;font-size:14px;line-height:22px;color:#625b56;">
<p style="margin:0 0 4px;color:#171615;">${EMAIL_BRAND.name}</p>
<p style="margin:0 0 8px;">${EMAIL_BRAND.tagline}</p>
<p style="margin:0;">${e(options.footerNote)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    html,
    attachments: [{
      filename: "glam-too-boutique.png",
      content: Buffer.from(wordmark, "base64"),
      contentType: "image/png",
      contentDisposition: "inline" as const,
      cid: options.logoCid,
    }],
  };
}

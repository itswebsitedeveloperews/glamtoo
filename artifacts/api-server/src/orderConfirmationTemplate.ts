import wordmark from "./assets/email-wordmark.png";

const LOGO_CID = "glam-too-order-wordmark";

export type ConfirmationOrder = {
  id: string;
  user_id: string;
  email: string;
  customer_name: string;
  currency: string;
  subtotal: number;
  discount_amount: number;
  delivery_amount: number;
  vat_amount: number;
  total: number;
  coupon_code: string | null;
  delivery_method: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postcode: string;
  country: string;
};

export type ConfirmationItem = {
  name: string;
  quantity: number;
  unit_amount: number;
  total: number;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function buildOrderConfirmation(
  order: ConfirmationOrder,
  items: ConfirmationItem[],
  publicUrl: string,
) {
  const reference = `#GM-${order.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;
  const money = (amount: number) => new Intl.NumberFormat("en-GB", {
    style: "currency", currency: order.currency.toUpperCase(),
  }).format(amount / 100);
  const address = [
    order.customer_name, order.address_line_1, order.address_line_2,
    order.city, order.postcode, order.country,
  ].filter(Boolean);
  const totals = [
    ["Subtotal", money(order.subtotal)],
    [`Discount${order.coupon_code ? ` (${order.coupon_code})` : ""}`, `-${money(order.discount_amount)}`],
    ["Delivery", order.delivery_amount === 0 ? "Free" : money(order.delivery_amount)],
    ["VAT included (not an additional charge)", money(order.vat_amount)],
    ["Total paid", money(order.total)],
  ];
  // A guest email is not proof of identity. Never include payment references,
  // guest cookies, or an unauthenticated link granting access to an order.
  const guest = order.user_id.startsWith("guest_");
  const link = new URL(guest ? "/contact" : "/account", publicUrl).href;
  const linkLabel = guest ? "Contact us about your order" : "Sign in to view your orders";
  const subject = `Glam Too — order confirmation ${reference}`;
  const text = [
    "Glam Too Boutique", `Thank you, ${order.customer_name || "there"}!`,
    `Your payment has been confirmed. Order ${reference}`,
    "We are preparing your order and will keep you updated.",
    "",
    ...items.map((item) => `${item.name} — quantity ${item.quantity} × ${money(item.unit_amount)} — ${money(item.total)}`),
    "",
    ...totals.map(([label, value]) => `${label}: ${value}`),
    "", `Delivery method: ${order.delivery_method}`,
    "Delivery address:", ...address,
    "", `${linkLabel}: ${link}`,
    ...(guest ? ["Please include your order reference when contacting us."] : []),
  ].join("\n");
  const e = escapeHtml;
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const wrap = "word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;";
  const rows = items.map((item) => `
<tr><td align="left" valign="top" style="padding:14px 8px 14px 0;border-bottom:1px solid #e8e1dc;${F}font-size:16px;line-height:24px;color:#171615;${wrap}">${e(item.name)}<br><span style="font-size:14px;line-height:22px;color:#625b56;">Qty ${item.quantity} &times; ${e(money(item.unit_amount))}</span></td>
<td align="right" valign="top" width="96" style="padding:14px 0;border-bottom:1px solid #e8e1dc;${F}font-size:16px;line-height:24px;color:#171615;white-space:nowrap;">${e(money(item.total))}</td></tr>`).join("");
  const totalRows = totals.slice(0, -1).map(([l, v]) => `
<tr><td align="left" valign="top" style="padding:5px 12px 5px 0;${F}font-size:14px;line-height:22px;color:#625b56;${wrap}">${e(l!)}</td>
<td align="right" valign="top" style="padding:5px 0;${F}font-size:14px;line-height:22px;color:#171615;white-space:nowrap;">${e(v!)}</td></tr>`).join("");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f1ed;color:#171615;${F}font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all;">Payment confirmed for order ${e(reference)}. Total paid ${e(money(order.total))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f1ed" style="width:100%;background-color:#f5f1ed;">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="width:100%;max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #d8d0ca;">
<tr><td height="4" bgcolor="#c96381" style="height:4px;font-size:0;line-height:0;background-color:#c96381;">&nbsp;</td></tr>
<tr><td align="center" bgcolor="#f5f1ed" style="padding:26px 24px 20px;background-color:#f5f1ed;border-bottom:1px solid #e8e1dc;">
<img src="cid:${LOGO_CID}" alt="Glam Too Boutique" width="220" height="63" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;border:0;color:#171615;font-family:Georgia,serif;font-size:24px;"></td></tr>
<tr><td align="left" style="padding:32px 28px 8px;">
<p style="margin:0 0 10px;${F}font-size:14px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b12d5c;">Order confirmed</p>
<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:400;color:#171615;">Thank you, ${e(order.customer_name || "there")}</h1>
<p style="margin:0 0 20px;${F}font-size:16px;line-height:24px;color:#171615;">Your payment has been confirmed. We are preparing your order and will keep you updated.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
<td align="left" bgcolor="#f9e8ee" style="padding:14px 16px;background-color:#f9e8ee;border-left:3px solid #c96381;${F}font-size:14px;line-height:22px;color:#171615;">Order <strong style="font-size:16px;">${e(reference)}</strong></td>
<td align="right" bgcolor="#f9e8ee" style="padding:14px 16px;background-color:#f9e8ee;${F}font-size:14px;line-height:22px;color:#171615;">Paid <strong style="font-size:16px;">${e(money(order.total))}</strong></td></tr></table>
</td></tr>
<tr><td align="left" style="padding:20px 28px 0;">
<h2 style="margin:0 0 4px;${F}font-size:18px;line-height:26px;font-weight:700;color:#171615;">Your items</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border-top:1px solid #e8e1dc;">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:10px;border-collapse:collapse;">${totalRows}
<tr><td align="left" style="padding:12px 12px 0 0;border-top:2px solid #171615;${F}font-size:18px;line-height:26px;font-weight:700;color:#171615;">Total paid</td>
<td align="right" style="padding:12px 0 0;border-top:2px solid #171615;${F}font-size:18px;line-height:26px;font-weight:700;color:#171615;white-space:nowrap;">${e(money(order.total))}</td></tr></table>
</td></tr>
<tr><td align="left" style="padding:28px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f2ee" style="width:100%;background-color:#f7f2ee;"><tr><td style="padding:18px;border-left:3px solid #c96381;${F}font-size:16px;line-height:26px;color:#171615;${wrap}">
<p style="margin:0 0 6px;font-size:14px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#625b56;">Delivery</p>
<p style="margin:0 0 8px;font-weight:700;">${e(order.delivery_method)}</p>
${address.map(e).join("<br>")}</td></tr></table>
</td></tr>
<tr><td align="left" style="padding:28px 28px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#e23d6f" style="background-color:#e23d6f;mso-padding-alt:14px 24px;">
<a href="${e(link)}" style="display:inline-block;padding:14px 24px;border:1px solid #e23d6f;background-color:#e23d6f;color:#ffffff;${F}font-size:16px;line-height:22px;font-weight:700;text-decoration:none;">${e(linkLabel)}</a></td></tr></table>
${guest ? `<p style="margin:16px 0 0;${F}font-size:14px;line-height:22px;color:#625b56;">Please include your order reference when contacting us.</p>` : ""}
</td></tr>
<tr><td align="center" bgcolor="#f5f1ed" style="padding:20px 24px;background-color:#f5f1ed;border-top:1px solid #e8e1dc;${F}font-size:14px;line-height:22px;color:#625b56;">Glam Too Boutique &middot; Prices include 20% VAT</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const attachments = [{
    filename: "glam-too-boutique.png",
    content: Buffer.from(wordmark, "base64"),
    contentType: "image/png",
    contentDisposition: "inline" as const,
    cid: LOGO_CID,
  }];
  return { subject, text, html, attachments };
}

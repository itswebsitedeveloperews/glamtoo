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
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f5f1eb;color:#171717;font-family:Arial,sans-serif;font-size:16px;line-height:1.5">
<main style="max-width:640px;margin:24px auto;background:#fff;padding:32px">
<div style="text-align:center;font-family:Georgia,serif;font-size:32px">Glam Too</div>
<div style="text-align:center;color:#df3e75;letter-spacing:3px;font-size:14px">BOUTIQUE</div>
<h1 style="font-size:26px;font-weight:normal">Thank you for your order</h1>
<p>Hello ${escapeHtml(order.customer_name || "there")}, your payment has been confirmed.</p>
<p><strong>Order ${reference}</strong><br>We are preparing your order and will keep you updated.</p>
<table style="width:100%;border-collapse:collapse;font-size:16px">
<thead><tr><th style="text-align:left;padding:12px 0;border-bottom:1px solid #ddd">Product / selected options</th>
<th style="padding:12px 8px;border-bottom:1px solid #ddd">Qty</th><th style="text-align:right;padding:12px 0;border-bottom:1px solid #ddd">Amount</th></tr></thead>
<tbody>${items.map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml(item.name)}<br>
<span style="font-size:14px;color:#666">${money(item.unit_amount)} each</span></td>
<td style="text-align:center;padding:12px 8px;border-bottom:1px solid #eee">${item.quantity}</td>
<td style="text-align:right;padding:12px 0;border-bottom:1px solid #eee">${money(item.total)}</td></tr>`).join("")}</tbody></table>
<table style="width:100%;margin-top:16px;font-size:16px">${totals.map(([label, value]) =>
    `<tr><td style="padding:6px 0">${escapeHtml(label!)}</td><td style="text-align:right;padding:6px 0">${escapeHtml(value!)}</td></tr>`).join("")}</table>
<h2 style="font-size:20px;font-weight:normal">Delivery</h2>
<p>${escapeHtml(order.delivery_method)}</p>
<address style="font-style:normal">${address.map(escapeHtml).join("<br>")}</address>
<p style="margin-top:28px"><a href="${escapeHtml(link)}" style="color:#b12d5c">${linkLabel}</a></p>
${guest ? "<p style=\"font-size:14px\">Please include your order reference when contacting us.</p>" : ""}
</main></body></html>`;
  return { subject, text, html };
}

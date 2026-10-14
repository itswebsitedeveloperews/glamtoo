import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { buildOrderConfirmation, type ConfirmationOrder } from "../src/orderConfirmationTemplate";

const order: ConfirmationOrder = {
  id: "ord_example_12345678", user_id: "user_example", email: "shopper@example.test",
  customer_name: "Alex Example", currency: "gbp",
  subtotal: 5998, discount_amount: 500, delivery_amount: 399, vat_amount: 983, total: 5897,
  coupon_code: "WELCOME", delivery_method: "UK Standard Delivery",
  address_line_1: "1 Example Street", address_line_2: "Flat 2",
  city: "London", postcode: "AB1 2CD", country: "GB",
};
const items = [{ name: "Military Style Jacket · M/L", quantity: 2, unit_amount: 2999, total: 5998 }];

test("order email retains complete transaction information and plain text", () => {
  const mail = buildOrderConfirmation(order, items, "https://shop.example.test");
  for (const value of ["#GM-12345678", "Military Style Jacket", "M/L", "£59.98", "£5.00", "£3.99", "£9.83", "£58.97", "WELCOME", "UK Standard Delivery", "Flat 2"]) {
    assert.ok(mail.html.includes(value), value);
    assert.ok(mail.text.includes(value), value);
  }
  assert.equal(mail.subject, "Glam Too — order confirmation #GM-12345678");
  assert.ok(!mail.html.includes(order.email));
});

test("email has table-based centred layout and approved inline PNG branding", () => {
  const mail = buildOrderConfirmation(order, items, "https://shop.example.test");
  assert.match(mail.html, /align="center"/);
  assert.match(mail.html, /max-width:640px/);
  assert.match(mail.html, /src="cid:glam-too-order-wordmark"/);
  assert.ok(!/<main|display:\s*(?:flex|grid)|<script|<svg/.test(mail.html));
  assert.equal(mail.attachments[0].cid, "glam-too-order-wordmark");
  assert.equal(mail.attachments[0].content.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("user-supplied names, options, address and coupon are escaped", () => {
  const mail = buildOrderConfirmation({
    ...order, customer_name: '<img src=x onerror="bad()">', address_line_1: "<script>bad()</script>",
    coupon_code: "<b>coupon</b>",
  }, [{ ...items[0], name: "<script>item()</script>" }], "https://shop.example.test");
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(mail.html.includes("&lt;script&gt;item()&lt;/script&gt;"));
  assert.ok(mail.html.includes("&lt;b&gt;coupon&lt;/b&gt;"));
});

test("guest and signed-in links retain their existing private boundaries", () => {
  const guest = buildOrderConfirmation({ ...order, user_id: "guest_example" }, items, "https://shop.example.test");
  const signedIn = buildOrderConfirmation(order, items, "https://shop.example.test");
  assert.ok(guest.html.includes('href="https://shop.example.test/contact"'));
  assert.ok(!guest.html.includes("/account"));
  assert.ok(signedIn.html.includes('href="https://shop.example.test/account"'));
});

test("Nodemailer creates a complete branded MIME email without sending", async () => {
  const mail = buildOrderConfirmation(order, items, "https://shop.example.test");
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({ from: "sender@example.test", to: order.email, ...mail });
  const mime = result.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /Content-ID: <glam-too-order-wordmark>/);
  assert.match(mime, /Content-Type: image\/png/);
});

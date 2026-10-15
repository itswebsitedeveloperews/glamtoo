import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { brandedEmailDocument, EMAIL_BRAND } from "../src/emailBranding";
import { buildRefundNotificationMessage, type RefundNotificationType } from "../src/refundNotificationTemplate";
import { buildContactNotificationMessage } from "../src/contactNotificationEmail";

const types: RefundNotificationType[] = ["refund_processing", "refunded", "manual_resolution"];

test("all refund states use the shared identity and preserve their distinct outcome", () => {
  const details = [
    "We are processing your full refund now",
    "We have completed your full refund.",
    "Our customer-care team is completing the refund manually",
  ];
  types.forEach((type, index) => {
    const message = buildRefundNotificationMessage(type, "ord_12345678", "Alex Example");
    for (const value of [EMAIL_BRAND.name, EMAIL_BRAND.tagline, "#GM-12345678", details[index], "hello@glamtoo.co.uk"]) {
      assert.ok(message.html.includes(value), `${type}: HTML ${value}`);
      assert.ok(message.text.includes(value), `${type}: text ${value}`);
    }
    assert.match(message.html, /<!DOCTYPE html>/);
    assert.match(message.html, /max-width:640px/);
    assert.match(message.html, /background-color:#f5f1ed/);
    assert.match(message.html, /background-color:#e23d6f;color:#ffffff|background-color:#e23d6f;border:1px solid #e23d6f;color:#ffffff/);
    assert.match(message.html, /font-family:Georgia/);
    assert.match(message.html, /src="cid:glam-too-refund-wordmark"/);
    assert.equal(message.attachments[0].cid, "glam-too-refund-wordmark");
    assert.equal(message.attachments[0].content.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.doesNotMatch(message.html, /<script|<svg|display:\s*(?:grid|flex)/);
  });
});

test("refund names and wrapper values are escaped, with a blank-name fallback", () => {
  for (const type of types) {
    const message = buildRefundNotificationMessage(type, "ord_12345678", '<img src=x onerror="bad()">');
    assert.doesNotMatch(message.html, /<img src=x/);
    assert.match(message.html, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
    assert.match(buildRefundNotificationMessage(type, "ord_12345678", " ").html, /Hi there,/);
  }
  const html = brandedEmailDocument({
    subject: "<script>subject</script>", preheader: "<img src=x>", content: "<tr><td>Trusted body</td></tr>",
    logoCid: "brand", footerNote: "<b>footer</b>",
  }).html;
  assert.doesNotMatch(html, /<script>|<img src=x>|<b>footer/);
  assert.match(html, /&lt;b&gt;footer&lt;\/b&gt;/);
});

test("contact emails retain their admin-only notice and share the branded wrapper", () => {
  const message = buildContactNotificationMessage({
    id: 1, name: "Alex", email: "alex@example.test", topic: "Sizing", message: "Please help.", orderNumber: null,
  });
  assert.match(message.html, /Private admin notification\. No automatic reply was sent to the customer\./);
  assert.match(message.html, /max-width:640px/);
  assert.match(message.html, /font-family:Georgia/);
  assert.match(message.text, /Glam Too Boutique/);
});

test("refund branding is a real inline MIME attachment without using a provider", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const result = await transport.sendMail({
    from: "sender@example.test", to: "shopper@example.test",
    ...buildRefundNotificationMessage("refunded", "ord_12345678", "Alex"),
  });
  const mime = result.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /Content-ID: <glam-too-refund-wordmark>/);
  assert.match(mime, /Content-Type: image\/png/);
});

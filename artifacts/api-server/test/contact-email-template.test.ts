import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { buildContactNotificationMessage } from "../src/contactNotificationEmail";

const enquiry = {
  id: 42, name: "Avery Example", email: "avery@example.test",
  orderNumber: "GM-DEMO-42", topic: "Order help",
  message: "Hello Glam Too,\nCould you help with my order?\nThank you!",
};

test("branded enquiry email preserves its subject and complete plain-text fallback", () => {
  const mail = buildContactNotificationMessage(enquiry);
  assert.equal(mail.subject, "Glam Too contact enquiry #42");
  assert.equal(mail.text, [
    "Glam Too Boutique", "Outfits that make every moment yours.", "",
    "Enquiry: 42", "Name: Avery Example", "Email: avery@example.test",
    "Order number: GM-DEMO-42", "Topic: Order help", `Message: ${enquiry.message}`,
  ].join("\n"));
  for (const value of ["Avery Example", "avery@example.test", "GM-DEMO-42", "Order help", "Enquiry <strong>#42</strong>"]) {
    assert.ok(mail.html.includes(value));
  }
  assert.ok(mail.html.includes("Hello Glam Too,<br>Could you help with my order?<br>Thank you!"));
  assert.ok(mail.html.includes("Glam Too Boutique"));
  assert.ok(mail.html.includes("#e23d6f"));
  assert.ok(mail.html.includes("#f5f1ed"));
});

test("optional order number remains omitted when not provided", () => {
  const mail = buildContactNotificationMessage({ ...enquiry, orderNumber: null });
  assert.ok(!mail.text.includes("Order number"));
  assert.ok(!mail.html.includes("Order number"));
});

test("all user-controlled values are escaped and mixed message line endings survive", () => {
  const mail = buildContactNotificationMessage({
    ...enquiry, name: '<img src=x onerror="bad()">', email: 'x"@example.test',
    orderNumber: "<b>order</b>", topic: '<script>alert("x")</script>',
    message: "One\r\nTwo\rThree\n<script>bad()</script>& \" '",
  });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;bad()&quot;&gt;"));
  assert.ok(mail.html.includes("&lt;b&gt;order&lt;/b&gt;"));
  assert.ok(mail.html.includes("One<br>Two<br>Three<br>&lt;script&gt;bad()&lt;/script&gt;&amp; &quot; &#39;"));
  const href = mail.html.match(/href="(mailto:[^"]+)"/)?.[1];
  assert.ok(href);
  assert.ok(href.startsWith("mailto:x%22%40example.test?subject=Re%3A%20"));
  assert.ok(!href.includes("<"));
});

test("email uses the existing wordmark as an inline PNG, not a remote image", () => {
  const mail = buildContactNotificationMessage(enquiry);
  assert.match(mail.html, /src="cid:glam-too-contact-wordmark"/);
  assert.ok(!mail.html.includes('<svg'));
  assert.ok(!mail.html.includes('<img src="http'));
  assert.equal(mail.attachments[0].cid, "glam-too-contact-wordmark");
  assert.equal(mail.attachments[0].contentDisposition, "inline");
  assert.equal(mail.attachments[0].content.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("Nodemailer packages text, HTML and embedded branding without contacting SMTP", async () => {
  const mail = buildContactNotificationMessage(enquiry);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const result = await transport.sendMail({
    from: "sender@example.test", to: "admin@example.test", replyTo: enquiry.email,
    messageId: "<contact-template-test@example.test>", ...mail,
  });
  const mime = result.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /Content-Type: image\/png/);
  assert.match(mime, /Content-ID: <glam-too-contact-wordmark>/);
  assert.match(mime, /Content-Disposition: inline/);
  assert.match(mime, /Reply-To: avery@example.test/);
  assert.match(mime, /Message-ID: <contact-template-test@example.test>/);
});

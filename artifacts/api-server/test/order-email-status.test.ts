import { test } from "node:test";
import assert from "node:assert/strict";
import { projectOrderEmailStatus, type OrderEmailRecord } from "../src/orderEmailStatusProjection";

const order = { id: "ord_example", email: "customer@example.test", payment_status: "paid", payment_resolution: "none" };
const runtime = {
  transport: "gmail_smtp", customerConfigured: true, customerRecipientAllowed: true,
  customerAuthorizedSince: new Date("2026-10-01"), adminConfigured: true,
  adminEnabled: true, adminRecipients: ["admin@example.test"],
};
const record: OrderEmailRecord = {
  id: 1, notification_type: "order_confirmation", recipient_email: null, status: "pending",
  attempts: 0, provider: "mailersend", provider_message_id: null, created_at: new Date("2026-10-14"),
  updated_at: new Date("2026-10-14"), next_attempt_at: new Date("2026-10-14"),
  sent_at: null, accepted_at: null, delivered_at: null, last_error: null,
};
function project(row: Partial<OrderEmailRecord> = {}, state: Partial<typeof runtime> = {}) {
  return projectOrderEmailStatus(order, [{ ...record, ...row }], { ...runtime, ...state });
}
test("pending status reports planned Gmail, not the unused schema provider default", () => {
  const result = project();
  assert.equal(result.notifications[0].provider, "gmail_smtp");
  assert.equal(result.notifications[0].attempts, 0);
  assert.equal(result.notifications[0].blockReason, null);
  assert.equal(result.notifications[0].recipient, order.email);
  assert.match(result.notQueued.admin!, /saving settings later does not resend/);
});
test("restricted customer recipients explain why sending cannot start", () => {
  assert.match(project({}, { customerRecipientAllowed: false }).notifications[0].blockReason!, /restricted to approved recipients/);
});
test("missing configuration and historical Gmail cutoff are distinguished", () => {
  assert.match(project({}, { customerConfigured: false }).notifications[0].blockReason!, /not fully configured/);
  assert.match(project({ created_at: new Date("2026-09-01") }).notifications[0].blockReason!, /before the current Gmail/);
});
test("admin recipients retain their snapshots and each independent outcome", () => {
  const rows = [
    { ...record, notification_type: "admin_order_confirmation:first", recipient_email: "admin@example.test" },
    { ...record, id: 2, notification_type: "admin_order_confirmation:second", recipient_email: "old@example.test" },
  ];
  const result = projectOrderEmailStatus(order, rows, runtime);
  assert.equal(result.notifications[0].blockReason, null);
  assert.equal(result.notifications[1].recipient, "old@example.test");
  assert.match(result.notifications[1].blockReason!, /not currently enabled/);
  assert.equal(result.notQueued.admin, null);
  assert.match(result.notQueued.customer!, /No customer confirmation/);
});
test("disabled admin copies and payment resolution explain paused sends", () => {
  assert.match(project({ notification_type: "admin_order_confirmation:first", recipient_email: "admin@example.test" }, { adminEnabled: false }).notifications[0].blockReason!, /disabled/);
  const result = projectOrderEmailStatus({ ...order, payment_resolution: "refunded" }, [record], runtime);
  assert.match(result.notifications[0].blockReason!, /payment/);
});
test("SMTP acceptance does not manufacture inbox delivery or change saved errors", () => {
  const result = project({
    status: "accepted", attempts: 1, provider: "gmail_smtp", provider_message_id: "<example@example.test>",
    sent_at: new Date("2026-10-14"), accepted_at: new Date("2026-10-14"),
  });
  assert.equal(result.notifications[0].status, "accepted");
  assert.equal(result.notifications[0].deliveredAt, null);
  assert.equal(result.notifications[0].messageId, "<example@example.test>");
  assert.equal(project({ status: "uncertain", last_error: "Reconcile before resending" }).notifications[0].lastError, "Reconcile before resending");
});
test("refund notifications and unrelated records stay out of this projection", () => {
  const result = projectOrderEmailStatus(order, [{ ...record, notification_type: "order_refund" }], runtime);
  assert.equal(result.notifications.length, 0);
});

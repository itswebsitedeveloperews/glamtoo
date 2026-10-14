import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { emailRecipientPolicy, orderConfirmationRecipientPolicy } from "../src/emailRecipientPolicy";

beforeEach(() => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "test@example.test";
  process.env.ORDER_EMAIL_SEND_TO_ALL = "false";
  delete process.env.ORDER_CONFIRMATION_SEND_TO_ALL;
  delete process.env.ORDER_CONFIRMATION_ENABLED_SINCE;
  delete process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS;
});

test("legacy testing restrictions remain unchanged until customer rollout is enabled", () => {
  assert.deepEqual(orderConfirmationRecipientPolicy(), {
    recipients: ["test@example.test"], allCustomers: false, allCustomersSince: null,
  });
});

test("customer-only rollout enables new confirmations without enabling refund recipients", () => {
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = "2026-10-14T15:00:00.000Z";
  assert.deepEqual(orderConfirmationRecipientPolicy(), {
    recipients: ["test@example.test"], allCustomers: true,
    allCustomersSince: new Date("2026-10-14T15:00:00.000Z"),
  });
  assert.equal(emailRecipientPolicy()!.allCustomers, false);
});

test("customer rollout does not require the old test-recipient list", () => {
  process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS = "";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = "2026-10-14T15:00:00.000Z";
  assert.equal(orderConfirmationRecipientPolicy()!.allCustomers, true);
  assert.equal(emailRecipientPolicy(), null);
});

test("missing or invalid activation dates fail closed instead of releasing historical mail", () => {
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "true";
  assert.throws(orderConfirmationRecipientPolicy, /activation date/);
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = "invalid";
  assert.throws(orderConfirmationRecipientPolicy, /activation date/);
});

test("disabling customer rollout restores the original recipient restriction", () => {
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "false";
  process.env.ORDER_CONFIRMATION_ENABLED_SINCE = "2026-10-14T15:00:00.000Z";
  assert.equal(orderConfirmationRecipientPolicy()!.allCustomers, false);
});

test("an explicitly empty staging allowlist sends to nobody, never everybody", () => {
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "false";
  process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS = "";
  assert.equal(orderConfirmationRecipientPolicy(), null);
});

test("staging addresses are configurable independently of production and refund policy", () => {
  process.env.ORDER_EMAIL_SEND_TO_ALL = "true";
  process.env.ORDER_CONFIRMATION_SEND_TO_ALL = "false";
  process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS = " First@example.test, SECOND@example.test ";
  assert.deepEqual(orderConfirmationRecipientPolicy(), {
    recipients: ["first@example.test", "second@example.test"], allCustomers: false, allCustomersSince: null,
  });
  assert.equal(emailRecipientPolicy()!.allCustomers, true);
});

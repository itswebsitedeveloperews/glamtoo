// Fail closed during staging. The same guard protects both workers when a new
// provider token is added, so old refund jobs cannot email real customers.
export function emailRecipientPolicy() {
  const recipients = (process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allCustomers = process.env.ORDER_EMAIL_SEND_TO_ALL === "true";
  return allCustomers || recipients.length > 0 ? { recipients, allCustomers } : null;
}

/**
 * Customer confirmations have their own explicit rollout. Do not enable the
 * shared policy: it also protects historical refund notifications.
 * An activation date prevents a new opt-in from releasing the old email queue.
 */
export function orderConfirmationRecipientPolicy() {
  const legacy = emailRecipientPolicy();
  const stagingList = process.env.ORDER_CONFIRMATION_TEST_RECIPIENTS;
  const recipients = stagingList === undefined ? legacy?.recipients ?? []
    : stagingList.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (process.env.ORDER_CONFIRMATION_SEND_TO_ALL !== "true") {
    // Explicit false is a staging override even if the legacy shared switch
    // allows all recipients. An empty staging list means send to nobody.
    const allCustomers = process.env.ORDER_CONFIRMATION_SEND_TO_ALL === "false" || stagingList !== undefined
      ? false : legacy?.allCustomers ?? false;
    return allCustomers || recipients.length ? { recipients, allCustomers, allCustomersSince: null as Date | null } : null;
  }
  const value = process.env.ORDER_CONFIRMATION_ENABLED_SINCE?.trim();
  const since = value ? new Date(value) : null;
  if (!since || !Number.isFinite(since.getTime())) {
    throw new Error("Customer confirmations require a valid ORDER_CONFIRMATION_ENABLED_SINCE activation date.");
  }
  return { recipients, allCustomers: true, allCustomersSince: since };
}

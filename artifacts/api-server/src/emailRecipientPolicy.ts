// Fail closed during staging. The same guard protects both workers when a new
// provider token is added, so old refund jobs cannot email real customers.
export function emailRecipientPolicy() {
  const recipients = (process.env.ORDER_EMAIL_ALLOWED_RECIPIENTS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allCustomers = process.env.ORDER_EMAIL_SEND_TO_ALL === "true";
  return allCustomers || recipients.length > 0 ? { recipients, allCustomers } : null;
}

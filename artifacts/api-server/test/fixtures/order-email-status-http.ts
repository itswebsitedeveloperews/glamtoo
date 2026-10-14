// Test-only state. Never imports a database or calls an identity/email provider.
export const statusHttpFixture = {
  access: "admin" as "anonymous" | "customer" | "admin" | "unavailable",
  result: "found" as "found" | "missing" | "unavailable",
  references: [] as string[],
  approvals: [] as Array<{ reference: string; actor: string }>,
};

export const statusHttpPayload = {
  orderId: "ord_http_fixture",
  notifications: [],
  notQueued: {
    customer: "No customer confirmation was queued for this order.",
    admin: "No admin copy was queued for this order.",
  },
};

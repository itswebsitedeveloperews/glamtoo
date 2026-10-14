import { createRoot } from "react-dom/client";
import AdminOrderEmailStatus from "../src/components/admin-order-email-status";

// Browser-only, synthetic rendering fixture. It neither authenticates to admin
// nor reads/writes orders or notifications. Not imported by the application.
const clock = "2026-10-14T10:47:32.000Z";
const base = {
  id: 1, audience: "customer", recipient: "customer@example.test", status: "pending",
  blockReason: "Customer emails are restricted to approved recipients. This customer is not currently approved; no sending attempt is authorised.",
  attempts: 0, maxAttempts: 5, provider: "gmail_smtp", messageId: null,
  queuedAt: clock, lastUpdatedAt: clock, sentAt: null, acceptedAt: null,
  deliveredAt: null, nextAttemptAt: clock, lastError: null,
};
let refreshed = false;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) !== "/api/admin/orders/fixture-order/email-status") return originalFetch(input, init);
  const notification = refreshed
    ? { ...base, status: "accepted", attempts: 1, blockReason: null, acceptedAt: clock, sentAt: clock, messageId: "<sample-message@example.test>" }
    : base;
  refreshed = true;
  return new Response(JSON.stringify({
    orderId: "fixture-order", notifications: [notification],
    notQueued: { customer: null, admin: "No admin copy was queued. Saving settings later does not resend older orders." },
  }), { headers: { "Content-Type": "application/json" } });
};
const fixture = document.createElement("div");
fixture.style.cssText = "max-width:900px;margin:32px auto;padding:16px;";
document.querySelector("#root")!.appendChild(fixture);
createRoot(fixture).render(<>
  <p style={{ fontSize: 14 }}>Order email status — synthetic sample data, not a live order</p>
  <AdminOrderEmailStatus orderId="fixture-order" />
</>);

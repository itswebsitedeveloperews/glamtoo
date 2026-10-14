import { createRoot } from "react-dom/client";
import AdminOrderEmailStatus from "../src/components/admin-order-email-status";
import "../src/index.css";

// Synthetic component fixture only; all requests are intercepted here. Never
// authenticates to admin or reads/writes live orders or notification records.
const scenario = new URLSearchParams(location.search).get("scenario") ?? "missing";
const clock = "2026-10-14T10:47:32.000Z";
const recipients = ["first@example.test", "second@example.test"];
let posts = 0;
let queued = false;
const base = {
  id: 1, audience: "customer", recipient: "customer@example.test", status: "pending",
  blockReason: "Customer emails are restricted to approved recipients.",
  retryBlockReason: "Only definitive failures can be retried.",
  attempts: 0, maxAttempts: 5, provider: "gmail_smtp", messageId: null,
  queuedAt: clock, lastUpdatedAt: clock, sentAt: null, acceptedAt: null,
  deliveredAt: null, nextAttemptAt: clock, lastError: null,
};
window.fetch = async (input, init) => {
  const path = String(input);
  if (!path.startsWith("/api/admin/orders/fixture-order/")) throw new Error("Fixture blocked an unexpected network request.");
  if (init?.method === "POST") {
    posts++;
    document.querySelector("#request-count")!.textContent = `Synthetic POST requests: ${posts}`;
    const body = JSON.parse(String(init.body));
    if (body.confirmed !== true || !Array.isArray(body.recipients)) throw new Error("Missing approval snapshot");
    if (scenario === "conflict") return Response.json({ error: "Recipients changed. Refresh and approve the current recipient snapshot." }, { status: 409 });
    queued = true;
    return new Response(null, { status: 202 });
  }
  const rows = [base];
  if (queued || scenario === "failed" || scenario === "uncertain" || scenario === "accepted") {
    const status = queued ? "pending" : scenario;
    rows.push({
      ...base, id: 2, audience: "admin", recipient: recipients[0], status,
      blockReason: null, retryBlockReason: !queued && scenario === "failed" ? null : "Only definitive failures can be retried.",
      attempts: 1, messageId: "<synthetic-admin@example.test>",
      acceptedAt: scenario === "accepted" ? clock : null,
      lastError: queued ? null : scenario === "failed" ? "Gmail rejected authentication before sending." : scenario === "uncertain" ? "SMTP outcome is unknown; reconcile the Message-ID." : null,
    } as typeof base);
  }
  return Response.json({
    orderId: "fixture-order", notifications: rows,
    adminCopyAction: { recipients, blockReason: rows.length > 1 ? "An admin copy is already recorded." : null },
    notQueued: { customer: null, admin: rows.length > 1 ? null : "No admin copy was queued for this order." },
  });
};
createRoot(document.querySelector("#root")!).render(
  <main style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
    <h1 style={{ fontSize: 24 }}>Synthetic order email actions</h1>
    <p style={{ fontSize: 16 }}>No live messages or order changes are possible in this fixture.</p>
    <p id="request-count" style={{ fontSize: 14 }} aria-live="polite">Synthetic POST requests: 0</p>
    <AdminOrderEmailStatus orderId="fixture-order" />
  </main>,
);

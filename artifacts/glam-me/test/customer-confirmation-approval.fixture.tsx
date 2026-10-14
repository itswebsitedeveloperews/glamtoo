// Synthetic browser-only fixture. It cannot authenticate, query real orders,
// approve a real notification or send email.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminOrderEmailStatus from "../src/components/admin-order-email-status";
import "../src/index.css";

const state = {
  posts: [] as Array<{ reference: string; body: unknown }>,
  gets: [] as string[],
  approved: new Set<string>(), failNext: false, delayMs: 300,
};
Object.assign(window, { customerApprovalFixture: state });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const reference = url.pathname.match(/^\/api\/admin\/orders\/(pi_fixture_[ab])\/(?:email-status|customer-email\/retry)$/)?.[1];
  if (!reference) throw new Error("Fixture blocks all non-fixture requests.");
  if (init?.method?.toUpperCase() === "POST") {
    state.posts.push({ reference, body: JSON.parse(String(init.body)) });
    await new Promise(resolve => setTimeout(resolve, state.delayMs));
    if (state.failNext) {
      state.failNext = false;
      return Response.json({ error: "Synthetic approval failure." }, { status: 503 });
    }
    state.approved.add(reference);
    return Response.json({ outcome: "approved", message: "Synthetic saved confirmation approved." });
  }
  state.gets.push(reference);
  return Response.json({
    orderId: reference.replace("pi_", "ord_internal_"),
    notifications: [],
    notQueued: { customer: "Synthetic held order.", admin: "No admin copy." },
    customerRetry: {
      eligible: !state.approved.has(reference),
      reason: state.approved.has(reference) ? "Already approved." : "Approve one saved customer.",
      recipient: `${reference}@example.test`,
    },
  });
};
function Fixture() {
  const [reference, setReference] = useState("pi_fixture_a");
  return <main style={{ margin: "24px auto", padding: 16, maxWidth: 800 }}>
    <h1>Synthetic customer approval check</h1>
    <button onClick={() => setReference("pi_fixture_a")}>Select order A</button>
    <button onClick={() => setReference("pi_fixture_b")}>Select order B</button>
    <AdminOrderEmailStatus orderId={reference} />
  </main>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);

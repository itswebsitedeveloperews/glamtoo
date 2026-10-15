// Vite-only test entry, not an application route or a production build entry.
// It mounts the actual panel with entirely synthetic network responses.
import { createRoot } from "react-dom/client";
import AdminEmailBrandingTests from "../../src/components/admin-email-branding-tests";
import "../../src/index.css";
import type { EmailBrandingTestStatus } from "@workspace/api-client-react";

const scenario = new URLSearchParams(location.search).get("scenario") ?? "ready";
const key = `branding-control-fixture-${scenario}`;
let posts = 0;
let status: EmailBrandingTestStatus = {
  configured: scenario !== "unconfigured", recipient: "approved@example.test",
  canSend: scenario !== "unconfigured", samples: [],
};
const saved = sessionStorage.getItem(key);
if (saved) status = JSON.parse(saved);
const variants = ["order", "contact", "refund_processing", "refunded", "manual_resolution"];
window.fetch = async (input, init) => {
  if (!String(input).endsWith("/api/admin/email-branding-tests")) throw new Error("Non-fixture request blocked");
  if (scenario === "unavailable") return Response.json({ error: "Synthetic settings unavailable." }, { status: 503 });
  if (init?.method === "POST") {
    posts++;
    document.documentElement.dataset.posts = String(posts);
    if (!status.canSend) return Response.json({ error: "This approval has already been used." }, { status: 409 });
    status = {
      ...status, canSend: false,
      samples: variants.map((variant, i) => ({
        variant, marker: "GT-QA-SYNTHETIC-FIXTURE", messageId: `<synthetic-${i}@notifications.glamtoo.invalid>`,
        subject: `[SYNTHETIC GT-QA-SYNTHETIC-FIXTURE] ${variant}`,
        status: scenario === "uncertain" ? (i === 0 ? "uncertain" : "not_sent") : "accepted",
      })),
    };
    sessionStorage.setItem(key, JSON.stringify(status));
    if (scenario === "lost-response") throw new Error("Simulated lost response. Refresh recorded results; do not resend.");
  }
  return Response.json(status);
};
document.documentElement.dataset.posts = "0";
createRoot(document.getElementById("root")!).render(<main className="admin-shell" style={{ maxWidth: 920, margin: "24px auto" }}><AdminEmailBrandingTests /></main>);

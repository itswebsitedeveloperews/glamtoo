import { useEffect, useState } from "react";
import type { EmailBrandingTestStatus } from "@workspace/api-client-react";

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/email-branding-tests`;
const labels: Record<string, string> = {
  order: "Order confirmation", contact: "Contact admin alert",
  refund_processing: "Refund processing", refunded: "Refund complete", manual_resolution: "Manual refund resolution",
};
const outcomes: Record<string, string> = {
  reserved: "Reserved — not confirmed sent; do not resend",
  sending: "Sending or interrupted — reconcile the Message-ID",
  accepted: "SMTP accepted — inbox receipt not yet verified",
  failed: "Stopped after a known pre-send failure or rejection; no automatic retry",
  uncertain: "Outcome uncertain — reconcile the Message-ID; do not resend",
  not_sent: "Not attempted because the batch stopped",
};

export default function AdminEmailBrandingTests() {
  const [status, setStatus] = useState<EmailBrandingTestStatus | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch(api, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test-email settings could not be loaded.");
      setStatus(data); setError("");
    } catch (failure) {
      setStatus(null); setConfirmed(false);
      setError(failure instanceof Error ? failure.message : "Test-email settings could not be loaded.");
    }
  }
  useEffect(() => { void refresh(); }, []);
  async function send() {
    if (!confirmed || !status?.canSend || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(api, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: status.recipient, confirmation: "SEND FIVE SYNTHETIC EMAILS" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The test batch could not finish.");
      setStatus(data);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The outcome is unknown. Refresh recorded results; do not resend.";
      // Always invalidate the send control after a lost response, until GET reconciles it.
      setStatus(null);
      await refresh();
      setError(message);
    } finally { setConfirmed(false); setBusy(false); }
  }
  return (
    <section className="admin-payment-card" aria-labelledby="email-branding-tests-title" style={{ padding: 24, marginBottom: 24 }}>
      <h3 id="email-branding-tests-title" style={{ fontSize: 20, marginBottom: 12 }}>Synthetic email branding tests</h3>
      <p style={{ fontSize: 16 }}>Send five clearly labelled samples: order confirmation, contact alert and all three refund states. No order, enquiry, payment or refund is created.</p>
      <p style={{ fontSize: 14 }}>This uses a separate, single-recipient test approval. Customer-send restrictions and historical notifications stay unchanged. Samples use Gmail SMTP only; they do not activate or verify the live refund provider.</p>
      {status?.recipient && <p style={{ fontSize: 16, overflowWrap: "anywhere" }}><strong>Approved recipient:</strong> {status.recipient}</p>}
      {status && !status.configured && <p style={{ fontSize: 14 }}>A separate recipient approval and an authorized Gmail sender are required in this environment. Do not reconnect Gmail to the preview if it is unavailable there.</p>}
      {status?.canSend && <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 16, margin: "16px 0" }}>
        <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} style={{ marginTop: 5 }} />
        <span>I approve sending exactly five synthetic messages to {status.recipient}. This approval can be used only once.</span>
      </label>}
      <div className="admin-payment-actions">
        <button type="button" className="admin-primary" disabled={!status?.canSend || !confirmed || busy}
          style={!status?.canSend || !confirmed || busy ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={() => void send()}>
          {busy ? "Sending approved samples…" : "Send five synthetic emails once"}
        </button>
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => { setConfirmed(false); void refresh(); }}>Refresh recorded results</button>
      </div>
      <div aria-live="polite" style={{ fontSize: 14, marginTop: 12 }}>
        {status?.samples.length ? <p>This approval is consumed. Refreshing does not send or retry email.</p> : null}
        {status?.samples.map(sample => <div key={sample.variant} style={{ borderTop: "1px solid #ddd", padding: "14px 0", overflowWrap: "anywhere" }}>
          <p style={{ fontSize: 16, margin: "0 0 4px" }}><strong>{labels[sample.variant] ?? sample.variant}</strong></p>
          <p style={{ margin: "0 0 4px" }}>{outcomes[sample.status]}</p>
          <p style={{ margin: "0 0 4px" }}>Marker: {sample.marker}</p>
          <p style={{ margin: "0 0 4px" }}>Subject: {sample.subject}</p>
          <p style={{ margin: 0 }}>Message-ID: <code>{sample.messageId}</code></p>
        </div>)}
      </div>
      {error && <p role="alert" style={{ fontSize: 14, marginTop: 12 }}>{error}</p>}
      <p style={{ fontSize: 14 }}>Match these identifiers with the received originals. Check each sample in Gmail and Outlook on desktop and mobile, in light and dark mode. Acceptance is not delivery or visual verification. Never resend just because evidence is missing.</p>
    </section>
  );
}

import { useEffect, useState } from "react";

type GmailStatus = {
  configured: boolean; connected: boolean; callbackUrl: string | null;
  recipientRestricted: boolean; error?: string;
};
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/gmail`;
const outcomes: Record<string, string> = {
  connected: "Google authorization is saved. Use Check authentication to verify current Gmail access. This is not inbox-delivery proof.",
  cancelled: "Google authorization was cancelled.",
  wrong_mailbox: "Choose the same Google mailbox configured as the Gmail sender.",
  missing_permission: "Google did not grant the required SMTP permission. Reconnect and approve Gmail access.",
  invalid_state: "The authorization expired or could not be verified. Start again from this page.",
  not_authorized: "Administrator access is required to connect Gmail.",
  failed: "Gmail authorization failed. Check your Google OAuth client, callback URL and account settings.",
};

export default function AdminGmailSettings() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => outcomes[new URLSearchParams(window.location.search).get("gmail") ?? ""] ?? "");
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch(api, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gmail settings could not be loaded.");
      setStatus(data); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Gmail settings could not be loaded."); }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  async function action(kind: "connect" | "verify") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${api}/${kind}`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gmail could not be checked.");
      if (kind === "connect") window.location.assign(data.authorizationUrl);
      else { setMessage("Gmail SMTP authentication passed. No email was sent; inbox delivery is not yet verified."); await refresh(); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Gmail could not be checked."); }
    finally { setBusy(false); }
  }
  return (
    <section className="admin-payment-card" aria-labelledby="gmail-settings-title" style={{ padding: 24, marginBottom: 24 }}>
      <h3 id="gmail-settings-title" style={{ fontSize: 20, marginBottom: 12 }}>Gmail notification connection</h3>
      <p style={{ fontSize: 16 }}>Gmail SMTP · OAuth2 · {status?.connected ? "Authorization saved" : "Authorization needed"}</p>
      <p style={{ fontSize: 14 }}>Use your Google OAuth Web application client and enable the Gmail API in its Google Cloud project so we can verify the sender mailbox. Add the callback URL below to its authorized redirect URIs, then connect that mailbox.</p>
      {status?.callbackUrl && <p style={{ fontSize: 14, overflowWrap: "anywhere" }}><strong>Google callback URL:</strong> <code>{status.callbackUrl}</code></p>}
      <p style={{ fontSize: 14 }}>Google SMTP requires full Gmail permission. This app uses it only for authentication and sending approved notifications, not reading messages. Google OAuth apps in Testing may lose authorization after seven days.</p>
      <p style={{ fontSize: 14 }}>{status?.recipientRestricted ? "Sending is restricted to the configured test recipients." : "Customer sending is enabled by the recipient policy."} Connecting Gmail does not resend past orders. A saved authorization is not proof of current access or inbox delivery.</p>
      {!status?.configured && <p style={{ fontSize: 14 }}>Google credentials, sender, callback URL and secure storage must be configured before connecting.</p>}
      <div className="admin-payment-actions">
        <button type="button" className="admin-primary" disabled={busy || !status?.configured} onClick={() => void action("connect")}>{busy ? "Please wait…" : status?.connected ? "Reconnect Gmail" : "Connect Gmail"}</button>
        <button type="button" className="admin-secondary" disabled={busy || !status?.connected} onClick={() => void action("verify")}>Check authentication</button>
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => void refresh()}>Refresh settings</button>
      </div>
      <div aria-live="polite" style={{ fontSize: 14, marginTop: 12 }}>{message === outcomes.connected && !status?.connected ? "" : message}</div>
      {error && <p role="alert" style={{ fontSize: 14 }}>{error}</p>}
    </section>
  );
}

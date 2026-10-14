import { useEffect, useState, type FormEvent } from "react";

const settingsUrl = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/contact-notification-settings`;

export default function AdminContactEmailSettings({ onOpenGmail, kind = "contact" }: { onOpenGmail?: () => void; kind?: "contact" | "order" }) {
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fallbackEmail, setFallbackEmail] = useState("");
  const orders = kind === "order";
  const headingId = `${kind}-email-settings-title`;
  const inputId = `${kind}-admin-emails`;
  async function readResponse(response: Response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Email settings API is unavailable. Publish the updated API and database changes, then retry.");
    }
    try { return await response.json(); }
    catch { throw new Error("Email settings returned an invalid response. Retry after updating the API."); }
  }

  async function load() {
    setError("");
    try {
      const response = await fetch(settingsUrl, { credentials: "include" });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || "Contact email settings could not be loaded.");
      if (!Array.isArray(data.adminEmails) || !Array.isArray(data.orderAdminEmails)) {
        throw new Error("Email settings API is out of date. Publish the updated API and database changes, then retry.");
      }
      const recipients = orders ? data.orderAdminEmails ?? [] : data.adminEmails ?? (data.adminEmail ? [data.adminEmail] : []);
      setEmail(recipients.join("\n")); setEnabled(orders ? data.orderEnabled ?? false : data.enabled);
      setFallbackEmail(data.fallbackAdminEmail || "");
      setGmailConfigured(data.gmailConfigured); setLoaded(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Contact email settings could not be loaded."); }
  }
  useEffect(() => { setLoaded(false); void load(); }, [kind]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(settingsUrl, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orders
          ? { orderAdminEmails: [...new Set(email.split(/[,;\n]+/).map(value => value.trim().toLowerCase()).filter(Boolean))], orderEnabled: enabled }
          : { adminEmails: [...new Set(email.split(/[,;\n]+/).map(value => value.trim().toLowerCase()).filter(Boolean))], enabled }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || "Contact email settings could not be saved.");
      setEmail((orders ? data.orderAdminEmails : data.adminEmails).join("\n"));
      const savedEnabled = orders ? data.orderEnabled : data.enabled;
      setEnabled(savedEnabled); setFallbackEmail(data.fallbackAdminEmail || "");
      setMessage(savedEnabled ? `Saved. New ${orders ? "paid-order copies" : "enquiry alerts"} will use this list, or the fallback admin email when blank.` : "Saved. These admin email alerts are disabled.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Contact email settings could not be saved."); }
    finally { setSaving(false); }
  }
  return (
    <section className="admin-panel" aria-labelledby={headingId} style={{ padding: 24, marginBottom: 24 }}>
      <h3 id={headingId}>{orders ? "Admin order confirmation copies" : "Admin enquiry notifications"}</h3>
      <p style={{ fontSize: 14, margin: "12px 0" }}>Send {orders ? "new paid-order confirmations" : "new contact enquiries"} to multiple admin recipients through Gmail. These private recipients do not change login permissions or public contact details. Saving does not resend old messages.</p>
      <form onSubmit={event => void save(event)}>
        <label htmlFor={inputId} style={{ display: "block", fontSize: 14, marginBottom: 8 }}>Admin notification emails</label>
        <textarea id={inputId} value={email} rows={3} maxLength={5100} disabled={!loaded || saving}
          placeholder={"admin@example.com\nmanager@example.com"} onChange={event => { setEmail(event.target.value); setMessage(""); }}
          style={{ fontSize: 16, width: "100%", maxWidth: 520, padding: 12, marginBottom: 16 }} />
        <p style={{ fontSize: 14, marginBottom: 16 }}>Separate addresses with commas, semicolons or new lines (up to 20). Leave blank to use the admin email: <strong>{fallbackEmail || "a verified admin account email is required"}</strong>.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, marginBottom: 16 }}>
          <input type="checkbox" checked={enabled} disabled={!loaded || saving} onChange={event => { setEnabled(event.target.checked); setMessage(""); }} />
          {orders ? "Email new paid-order copies to these admins" : "Email new enquiries to these admins"}
        </label>
        <p style={{ fontSize: 14, marginBottom: 16 }}>{orders ? "Customer confirmations keep their existing recipient restrictions. Admin copies are separate and do not block payment." : "Every enquiry is saved below even if email fails. No automatic customer reply is sent."}</p>
        {loaded && !gmailConfigured && <p style={{ fontSize: 14, marginBottom: 16 }}>Gmail credentials or authorization are not available in this environment. Connect Gmail under Payments before alerts can send.</p>}
        <button className="admin-primary" type="submit" disabled={!loaded || saving}>{saving ? "Saving…" : "Save email settings"}</button>{" "}
        {onOpenGmail && <button className="admin-secondary" type="button" onClick={onOpenGmail}>Gmail connection settings</button>}
        {!loaded && error && <button className="admin-secondary" type="button" onClick={() => void load()}>Retry settings</button>}
      </form>
      {error && <p className="admin-payment-error" role="alert">{error}</p>}
      <p aria-live="polite" style={{ fontSize: 14, marginTop: 12 }}>{message}</p>
    </section>
  );
}

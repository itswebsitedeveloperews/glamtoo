import { useCallback, useEffect, useRef, useState } from "react";

type Notification = {
  id: number; audience: "customer" | "admin"; recipient: string | null; status: string; blockReason: string | null;
  attempts: number; maxAttempts: number; provider: string | null; messageId: string | null; queuedAt: string;
  lastUpdatedAt: string; sentAt: string | null; acceptedAt: string | null; deliveredAt: string | null;
  nextAttemptAt: string; lastError: string | null;
};
type EmailStatus = { orderId: string; notifications: Notification[]; notQueued: { customer: string | null; admin: string | null } };

const stages = ["Queued", "Sending", "Accepted by provider", "Delivered"] as const;

function when(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
}

function sanitize(error: string) {
  return error.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/(token|secret|key|password|bearer)\S*/gi, "[hidden]").replace(/\s+/g, " ").slice(0, 240);
}

function stageIndex(n: Notification) {
  if (n.deliveredAt) return 3;
  if (n.acceptedAt) return 2;
  if (n.sentAt || n.status === "sending") return 1;
  return 0;
}

function NotificationRow({ n }: { n: Notification }) {
  const current = stageIndex(n);
  const failed = /fail|uncertain|blocked|not_configured/i.test(n.status) || Boolean(n.lastError);
  const times = [when(n.queuedAt), when(n.sentAt), when(n.acceptedAt), when(n.deliveredAt)];
  return (
    <li className="aoes-row">
      <div className="aoes-row-head">
        <strong>{n.recipient || "Recipient not recorded"}</strong>
        <span className="aoes-state">{n.status.replace(/_/g, " ")}</span>
      </div>
      <ol className="aoes-stages" aria-label="Email stages">
        {stages.map((label, i) => (
          <li key={label} className={i <= current && (i < 3 || n.deliveredAt) ? "is-done" : ""}>
            <b>{label}</b>
            <span>{i <= current && times[i] ? times[i] : i === 3 ? "No delivery confirmation recorded" : "Not reached"}</span>
          </li>
        ))}
      </ol>
      {current === 2 && <p className="aoes-note">Accepted means the email provider took the message. It does not confirm it reached the inbox.</p>}
      {n.blockReason && <p className="aoes-note">Waiting: {n.blockReason}</p>}
      {!n.deliveredAt && !n.acceptedAt && !n.blockReason && !failed && <p className="aoes-note">Next attempt {when(n.nextAttemptAt) ?? "not scheduled"}.</p>}
      {n.lastError && <p className="aoes-error">Recorded failure: {sanitize(n.lastError)}</p>}
      <p className="aoes-meta">Attempts {n.attempts} of {n.maxAttempts}{n.provider ? ` · ${n.provider}` : ""} · Updated {when(n.lastUpdatedAt) ?? "unknown"}</p>
      {n.messageId && <details className="aoes-msg"><summary>Message-ID</summary><code>{n.messageId}</code></details>}
    </li>
  );
}

export default function AdminOrderEmailStatus({ orderId, onOpenPayments }: { orderId: string; onOpenPayments?: () => void }) {
  const [data, setData] = useState<EmailStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Date | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  const load = useCallback(async (id: string, quiet: boolean) => {
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/email-status`, { credentials: "include" });
      const body = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
      if (!res.ok || !body || !Array.isArray(body.notifications)) throw new Error(body?.error || "Email status is unavailable.");
      if (!alive.current || mine !== seq.current) return;
      setData(body as EmailStatus); setError(""); setChecked(new Date());
    } catch (failure) {
      if (!alive.current || mine !== seq.current) return;
      setError(failure instanceof Error ? failure.message : "Email status could not be loaded.");
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setData(null); setError("");
    void load(orderId, false);
    const timer = window.setInterval(() => void load(orderId, true), 30000);
    return () => { alive.current = false; seq.current++; window.clearInterval(timer); };
  }, [orderId, load]);

  const channels: Array<{ key: "customer" | "admin"; title: string }> = [
    { key: "customer", title: "Customer confirmation" },
    { key: "admin", title: "Admin copy" },
  ];

  return (
    <section className="admin-order-card aoes" aria-labelledby="aoes-title" aria-busy={loading}>
      <div className="admin-order-card-heading">
        <div><p className="admin-eyebrow">Email</p><h2 id="aoes-title">Email status</h2></div>
        <button className="admin-secondary" type="button" disabled={loading} onClick={() => void load(orderId, false)}>{loading ? "Checking…" : "Refresh"}</button>
      </div>
      <p className="aoes-lead">Payment, email sending and inbox delivery are separate. Payment is recorded above; each stage below shows only what has been recorded.</p>
      {loading && !data && <div className="aoes-skeleton" aria-label="Loading email status"><i /><i /></div>}
      {error && <p className="admin-payment-error" role="alert">{error} {data ? "Showing the last loaded status." : ""} <button className="admin-secondary" type="button" onClick={() => void load(orderId, false)}>Retry</button></p>}
      {data && channels.map(({ key, title }) => {
        const rows = data.notifications.filter((n) => n.audience === key);
        return (
          <div className="aoes-channel" key={key}>
            <h3>{title}</h3>
            {rows.length === 0
              ? <p className="aoes-empty">Nothing queued. {data.notQueued[key] || "No reason was recorded."}</p>
              : <ul>{rows.map((n) => <NotificationRow n={n} key={n.id} />)}</ul>}
          </div>
        );
      })}
      <p className="aoes-meta">{checked ? `Last checked ${when(checked.toISOString())}. Updates every 30 seconds.` : "Updates every 30 seconds."} This panel is read-only.</p>
      <p className="aoes-meta">Gmail sending is set up under Payments. {onOpenPayments ? <button className="aoes-link" type="button" onClick={onOpenPayments}>Open Payments settings</button> : "Open Payments in the admin menu."}</p>
    </section>
  );
}

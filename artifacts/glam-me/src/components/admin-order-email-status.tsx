import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderEmailActionInput } from "@workspace/api-client-react";

type Notification = {
  id: number; audience: "customer" | "admin"; recipient: string | null; status: string; blockReason: string | null;
  attempts: number; maxAttempts: number; provider: string | null; messageId: string | null; queuedAt: string;
  lastUpdatedAt: string; sentAt: string | null; acceptedAt: string | null; deliveredAt: string | null;
  nextAttemptAt: string; lastError: string | null;
  retryBlockReason?: string | null;
};
type EmailStatus = {
  orderId: string; notifications: Notification[]; notQueued: { customer: string | null; admin: string | null };
  adminCopyAction?: { recipients: string[]; blockReason: string | null };
};

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

function NotificationRow({ n, onRetry, disabled }: { n: Notification; onRetry: () => void; disabled: boolean }) {
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
      {n.retryBlockReason === null && <button className="admin-secondary" type="button" disabled={disabled} onClick={onRetry}>Review one-time retry</button>}
      {n.status === "failed" && n.retryBlockReason && <p className="aoes-note">Retry unavailable: {n.retryBlockReason}</p>}
    </li>
  );
}

export default function AdminOrderEmailStatus({ orderId, onOpenPayments }: { orderId: string; onOpenPayments?: () => void }) {
  const [data, setData] = useState<EmailStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Date | null>(null);
  const [approval, setApproval] = useState<{ orderId: string; input: OrderEmailActionInput } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const seq = useRef(0);
  const alive = useRef(true);
  const activeOrder = useRef(orderId);
  activeOrder.current = orderId;
  const inFlight = useRef(false);

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
    setData(null); setError(""); setApproval(null); setConfirmed(false); setNotice("");
    void load(orderId, false);
    const timer = window.setInterval(() => void load(orderId, true), 30000);
    return () => { alive.current = false; seq.current++; window.clearInterval(timer); };
  }, [orderId, load]);

  function review(input: OrderEmailActionInput) {
    setApproval({ orderId, input }); setConfirmed(false); setNotice("");
  }
  async function submit() {
    if (!approval || !confirmed || inFlight.current || approval.orderId !== orderId) return;
    const selected = approval;
    inFlight.current = true; setSubmitting(true); setNotice("");
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(selected.orderId)}/email-actions`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected.input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not confirm the email action. Refresh its status before trying again.");
      }
      if (alive.current && activeOrder.current === selected.orderId) setNotice("Approved email queued. This does not confirm sending or inbox delivery.");
    } catch (failure) {
      if (alive.current && activeOrder.current === selected.orderId) setNotice(failure instanceof Error ? failure.message : "Could not confirm the email action. Refresh before trying again.");
    } finally {
      if (alive.current) {
        if (activeOrder.current === selected.orderId) {
          setApproval(null); setConfirmed(false);
          await load(selected.orderId, true);
        }
      }
      // Keep every action disabled until the saved state is reloaded. Otherwise
      // a second click can reopen an approval against the pre-request snapshot.
      inFlight.current = false;
      if (alive.current) setSubmitting(false);
    }
  }
  const channels: Array<{ key: "customer" | "admin"; title: string }> = [
    { key: "customer", title: "Customer confirmation" },
    { key: "admin", title: "Admin copy" },
  ];

  return (
    <section className="admin-order-card aoes" aria-labelledby="aoes-title" aria-busy={loading}>
      <div className="admin-order-card-heading">
        <div><p className="admin-eyebrow">Email</p><h2 id="aoes-title">Email status</h2></div>
        <button className="admin-secondary" type="button" disabled={loading || submitting} onClick={() => void load(orderId, false)}>{loading ? "Checking…" : "Refresh"}</button>
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
              : <ul>{rows.map((n) => <NotificationRow n={n} key={n.id} disabled={submitting || Boolean(approval) || Boolean(error)} onRetry={() => review({ action: "retry", confirmed: true, notificationId: n.id, recipients: [n.recipient!] })} />)}</ul>}
            {key === "admin" && rows.length === 0 && data.adminCopyAction && (
              data.adminCopyAction.blockReason
                ? <p className="aoes-note">Manual copy unavailable: {data.adminCopyAction.blockReason}</p>
                : <button className="admin-secondary" type="button" disabled={submitting || Boolean(approval) || Boolean(error)} onClick={() => review({ action: "admin_copy", confirmed: true, recipients: [...data.adminCopyAction!.recipients] })}>Review one-time admin copy</button>
            )}
          </div>
        );
      })}
      {approval && approval.orderId === orderId && (
        <fieldset className="aoes-approval" disabled={submitting}>
          <legend>{approval.input.action === "admin_copy" ? "Approve one-time admin copy" : "Approve one-time safe retry"}</legend>
          <p>This will queue an email for order {orderId} to each address below. It will not change email settings or resend other orders.</p>
          <ul>{approval.input.recipients.map(email => <li key={email}>{email}</li>)}</ul>
          <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I approve sending to these exact recipients.</label>
          <div className="aoes-approval-buttons">
            <button className="admin-secondary" type="button" onClick={() => { setApproval(null); setConfirmed(false); }}>Cancel</button>
            <button className="admin-primary" type="button" disabled={!confirmed || submitting} onClick={() => void submit()}>{submitting ? "Queuing…" : "Confirm and queue email"}</button>
          </div>
        </fieldset>
      )}
      {notice && <p className="aoes-note" role="status">{notice}</p>}
      <p className="aoes-meta">{checked ? `Last checked ${when(checked.toISOString())}. Updates every 30 seconds.` : "Updates every 30 seconds."} Checking status never sends emails. Sending requires explicit approval.</p>
      <p className="aoes-meta">Gmail sending is set up under Payments. {onOpenPayments ? <button className="aoes-link" type="button" onClick={onOpenPayments}>Open Payments settings</button> : "Open Payments in the admin menu."}</p>
    </section>
  );
}

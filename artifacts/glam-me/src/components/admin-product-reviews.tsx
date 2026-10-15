import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { moderateProductReview, useGetAdminReviews, type GetAdminReviewsStatus } from "@workspace/api-client-react";
import "../reviews.css";

const tabs: GetAdminReviewsStatus[] = ["pending", "approved", "rejected"];
type Status = "pending" | "approved" | "rejected";

export default function AdminProductReviews() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const q = useGetAdminReviews({ status, page });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  useEffect(() => { if (q.data && page > pages) setPage(pages); }, [q.data, page, pages]);

  const moderate = useCallback(async (id: number, next: Status) => {
    setBusyId(id); setFeedback(null);
    try {
      const res = await moderateProductReview(id, { status: next });
      setFeedback({ ok: true, text: res?.message || `Review moved to ${next}.` });
      await qc.invalidateQueries({ predicate: (k) => String(k.queryKey[0]).includes("/reviews") });
    } catch { setFeedback({ ok: false, text: "That change could not be saved. Please try again." }); }
    finally { setBusyId(null); }
  }, [qc]);

  return (
    <section className="admin-panel" style={{ padding: 24 }} aria-label="Review moderation" data-testid="section-admin-reviews">
      <div className="rv-admin-tabs" role="group" aria-label="Filter by status">
        {tabs.map((t) => <button key={t} type="button" className="admin-secondary" aria-pressed={status === t} onClick={() => { setStatus(t as Status); setPage(1); setFeedback(null); }} data-testid={`tab-reviews-${t}`}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <p role="status" aria-live="polite" className={feedback && !feedback.ok ? "rv-err" : "rv-meta"}>{feedback?.text}</p>
      {q.isLoading ? <p className="admin-users-state">Loading reviews…</p>
        : q.isError ? <div className="rv-banner" role="alert">Reviews could not be loaded. <button className="admin-secondary" type="button" onClick={() => void q.refetch()}>Retry</button></div>
        : !q.data || q.data.reviews.length === 0 ? <div className="rv-empty">No {status} reviews.</div>
        : q.data.reviews.map((r) => (
          <article className="rv-admin-row" key={r.id} data-testid={`admin-review-${r.id}`}>
            <div className="rv-meta"><strong>{r.productName}</strong> &middot; {r.rating} / 5 &middot; {r.displayName} &middot; {new Date(r.createdAt).toLocaleString("en-GB")}</div>
            <h4 style={{ margin: 0 }}>{r.title}</h4>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body}</p>
            <div className="rv-admin-actions">
              {(["approved", "rejected", "pending"] as Status[]).filter((s) => s !== r.status).map((s) => (
                <button key={s} type="button" className={s === "approved" ? "admin-primary" : "admin-secondary"} disabled={busyId !== null} onClick={() => void moderate(r.id, s)} data-testid={`button-review-${s}-${r.id}`}>
                  {busyId === r.id ? "Saving…" : s === "approved" ? "Approve" : s === "rejected" ? "Reject" : "Return to pending"}
                </button>
              ))}
            </div>
          </article>
        ))}
      {pages > 1 && (
        <div className="rv-pager">
          <button className="admin-secondary" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="admin-secondary" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

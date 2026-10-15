import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { getGetProductReviewAccessQueryKey, submitProductReview, updateMyProductReview, useGetProductReviewAccess, useGetProductReviews, type GetProductReviewAccess200, type OwnProductReview, type ProductReviews } from "@workspace/api-client-react";
import "../reviews.css";

type Access = { loaded: boolean; signedIn: boolean; userId: string | null; query: UseQueryResult<GetProductReviewAccess200> };
type Ctx = { access: Access; productId: number; page: number; setPage: (page: number) => void; data?: ProductReviews; isLoading: boolean; isError: boolean; refetch: () => void };
const ReviewsContext = createContext<Ctx | null>(null);

export function ProductReviewsProvider({ productId, children }: { productId: number; children: ReactNode }) {
  const [page, setPage] = useState(1);
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const userId = isSignedIn && user?.id ? user.id : null;
  const aq = useGetProductReviewAccess(productId, { query: { queryKey: [...getGetProductReviewAccessQueryKey(productId), userId ?? "anonymous"], enabled: !!userId, retry: false, refetchOnWindowFocus: true, staleTime: 0, gcTime: 60000 } });
  const access: Access = { loaded: isLoaded && (!isSignedIn || !!user), signedIn: !!userId, userId, query: aq as UseQueryResult<GetProductReviewAccess200> };
  const query = useGetProductReviews(productId, { page }, { query: { refetchInterval: 60000, refetchOnWindowFocus: true, refetchOnMount: "always", staleTime: 15000 } });
  const pagesCount = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;
  useEffect(() => { if (query.data && page > pagesCount) setPage(pagesCount); }, [query.data, page, pagesCount]);
  return <ReviewsContext.Provider value={{ access, productId, page, setPage, data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }}>{children}</ReviewsContext.Provider>;
}

export function Stars({ value }: { value: number }) {
  const r = Math.round(value);
  return <span className="rv-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= r ? "" : "off"}>&#9733;</span>)}</span>;
}

export function focusReviewForm(productId: number) {
  const panel = document.getElementById(`rv-panel-${productId}`);
  const form = document.getElementById(`rv-form-${productId}`);
  if (!form) {
    panel?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    const edit = panel?.querySelector<HTMLButtonElement>('[data-testid="button-edit-review"]');
    if (edit && !edit.disabled) edit.click(); else panel?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  (form.querySelector<HTMLElement>("input[type=radio]:checked") ?? form.querySelector<HTMLElement>("input[type=radio], button"))?.focus({ preventScroll: true });
}

export function ProductReviewSummary() {
  const ctx = useContext(ReviewsContext);
  if (!ctx || !ctx.data) return null;
  const { averageRating, total } = ctx.data;
  if (total === 0) return (
    <div className="rv-summary" data-testid="text-review-summary">
      <span>No reviews yet</span>
      <SummaryAction />
    </div>
  );
  return (
    <div className="rv-summary" data-testid="text-review-summary">
      <Stars value={averageRating} />
      <span>{averageRating.toFixed(1)} out of 5 from {total} {total === 1 ? "review" : "reviews"}</span>
      <a href="#product-reviews">Read reviews</a>
      <SummaryAction />
    </div>
  );
}

function reviewActionLabel(ctx: Ctx) {
  const d = ctx.access.query.data;
  if (!ctx.access.loaded || !ctx.access.signedIn || ctx.access.query.isError || !d?.eligible) return null;
  return d.review ? "Edit your review" : "Write a review";
}
function SummaryAction() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) return null;
  const label = reviewActionLabel(ctx);
  return label ? <button type="button" className="rv-linkbtn" onClick={() => focusReviewForm(ctx.productId)}>{label}</button> : null;
}

export type ReviewDraft = { rating: number; title: string; body: string; displayName: string; submissionId: string; errored: boolean };
export function validateReview(d: Pick<ReviewDraft, "rating" | "title" | "body" | "displayName">, needsName: boolean) {
  const e: Partial<Record<"rating" | "title" | "body" | "displayName", string>> = {};
  if (d.rating < 1 || d.rating > 5) e.rating = "Choose a rating from 1 to 5.";
  if (!d.title.trim()) e.title = "Add a short title.";
  else if (d.title.length > 120) e.title = "Title must be 120 characters or fewer.";
  if (!d.body.trim()) e.body = "Write your review.";
  else if (d.body.length > 3000) e.body = "Review must be 3000 characters or fewer.";
  if (d.displayName.length > 80) e.displayName = "Name must be 80 characters or fewer.";
  else if (needsName && !d.displayName.trim()) e.displayName = "Add the name to show with your review.";
  return e;
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
const blank = (): ReviewDraft => ({ rating: 0, title: "", body: "", displayName: "", submissionId: newId(), errored: false });
// Drafts are text only. They are scoped to account + product + review revision and never grant eligibility.
export const draftKey = (userId: string, productId: number, revision: number | null) => `glam-review-draft-v2:${userId}:${productId}:${revision ?? "new"}`;
function load(key: string, review: OwnProductReview | null): ReviewDraft {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) { const p = JSON.parse(raw) as Partial<ReviewDraft>; return { ...blank(), rating: Number(p.rating) || 0, title: String(p.title ?? ""), body: String(p.body ?? ""), displayName: String(p.displayName ?? ""), submissionId: typeof p.submissionId === "string" && p.submissionId ? p.submissionId : newId(), errored: !!p.errored }; }
  } catch { /* ignore */ }
  return review ? { ...blank(), rating: review.rating, title: review.title, body: review.body, displayName: "" } : blank();
}

const statusText = { pending: "Awaiting approval. Only you can see this review for now.", approved: "Approved and visible on this page. Editing it will hide it again until it is re-approved.", rejected: "Not approved. You can edit it and send it for another check." } as const;

function ReviewForm({ productId, userId, review, autoFocus, onClose, onSaved, onReloadLatest }: { productId: number; userId: string; review: OwnProductReview | null; autoFocus: boolean; onClose: () => void; onSaved: (message: string) => void; onReloadLatest: (storeKey: string) => Promise<boolean> }) {
  const qc = useQueryClient();
  const { user } = useUser();
  const storeKey = draftKey(userId, productId, review ? review.revision : null);
  const isEdit = !!review;
  const [draft, setDraft] = useState<ReviewDraft>(() => load(storeKey, review));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [success, setSuccess] = useState("");
  const inflight = useRef(false);
  const signedName = user?.firstName?.trim() || user?.username?.trim() || "";
  const needsName = !signedName;

  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft, storeKey]);
  useEffect(() => {
    if (!autoFocus) return;
    const f = document.getElementById(`rv-form-${productId}`);
    (f?.querySelector<HTMLElement>("input[type=radio]:checked") ?? f?.querySelector<HTMLElement>("input[type=radio]"))?.focus();
  }, [autoFocus, productId]);
  const edit = (patch: Partial<ReviewDraft>) => { setSuccess(""); setDraft((d) => ({ ...d, ...patch, ...(d.errored ? { submissionId: newId(), errored: false } : {}) })); };
  const errors = validateReview({ ...draft, displayName: needsName ? draft.displayName : "" }, needsName);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inflight.current || stale) return;
    setTouched(true); setError("");
    const first = (["rating", "title", "body", "displayName"] as const).find((k) => errors[k]);
    if (first) {
      setTimeout(() => {
        const form = document.getElementById(`rv-form-${productId}`);
        const target = first === "rating" ? form?.querySelector<HTMLElement>("input[type=radio]") : document.getElementById(`rv-${first === "displayName" ? "name" : first}-${productId}`);
        target?.focus();
      }, 0);
      return;
    }
    inflight.current = true; setBusy(true);
    const snapshot = draftRef.current;
    try {
      const name = needsName ? snapshot.displayName.trim() : "";
      const payload = { rating: snapshot.rating, title: snapshot.title.trim(), body: snapshot.body.trim(), submissionId: snapshot.submissionId, ...(name ? { displayName: name } : {}) };
      const res = review ? await updateMyProductReview(productId, { ...payload, expectedRevision: review.revision }) : await submitProductReview(productId, payload);
      const unchanged = draftRef.current === snapshot;
      if (unchanged) { try { sessionStorage.removeItem(storeKey); } catch { /* ignore */ } setTouched(false); }
      setSuccess(res?.message || "Thank you. Your review has been received and will appear once approved.");
      await qc.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0]); return k.includes("/reviews") || k.includes("/review-access"); } });
      if (unchanged) { onSaved(res?.message || "Thank you. Your review has been received and will appear once approved."); onClose(); }
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 409 && isEdit) { setStale(true); setDraft((d) => ({ ...d, submissionId: newId(), errored: false })); setError("This review changed since you opened it. Load the latest version before editing again. Your unsaved text stays here until you do."); }
      else if (status === 409) { setError("You already have a review for this product. Load it to edit it."); setStale(true); }
      else {
        setDraft((d) => ({ ...d, errored: status === undefined || status >= 500 }));
        setError(status === 401 ? "Your session has ended. Please sign in again." : status === 403 ? "Only customers who purchased this product can review it." : status === 429 ? "Too many attempts. Please wait a moment and try again." : status === 400 || status === 422 ? "The server could not accept this review. Please check your entries and try again." : "We could not confirm your review was sent. Retrying is safe and will not create a duplicate.");
        if (status === 400 || status === 422) setDraft((d) => ({ ...d, submissionId: newId(), errored: false }));
      }
    } finally { inflight.current = false; setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try { if (!(await onReloadLatest(storeKey))) setError("The latest version could not be loaded. Your draft was kept. Try again."); } finally { setBusy(false); }
  }
  const show = (k: keyof typeof errors) => (touched && errors[k] ? <p className="rv-err" id={`rv-${k}-err`}>{errors[k]}</p> : null);
  return (
    <form className="rv-form" onSubmit={(e) => void submit(e)} noValidate aria-busy={busy} id={`rv-form-${productId}`} aria-labelledby={`rv-form-h-${productId}`} data-testid="form-review">
      <h3 id={`rv-form-h-${productId}`}>{isEdit ? "Edit your review" : "Write a review"}</h3>
      {isEdit && <p className="rv-meta">Saving sends your changes back for approval, and the public version is hidden until then.</p>}
      {touched && Object.keys(errors).length > 0 && <div className="rv-banner" role="alert" data-testid="text-review-validation"><strong>Please fix the following:</strong><ul>{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul></div>}
      <div role="status" aria-live="polite">{success && <p className="rv-ok" data-testid="text-review-success">{success}</p>}</div>
      <fieldset aria-required="true" aria-describedby={touched && errors.rating ? "rv-rating-err" : undefined}>
        <legend>Your rating (required)</legend>
        <div className="rv-radios">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}><input type="radio" name={`rating-${productId}`} value={n} checked={draft.rating === n} onChange={() => edit({ rating: n })} required disabled={busy} data-testid={`radio-rating-${n}`} /><span>{n} <span aria-hidden="true">&#9733;</span><span className="sr-only"> star{n > 1 ? "s" : ""}</span></span></label>
          ))}
        </div>
        {show("rating")}
      </fieldset>
      <div>
        <label htmlFor={`rv-title-${productId}`}>Title (required)</label>
        <input id={`rv-title-${productId}`} type="text" required aria-required="true" maxLength={120} value={draft.title} onChange={(e) => edit({ title: e.target.value })} disabled={busy} aria-invalid={touched && !!errors.title} aria-describedby={touched && errors.title ? "rv-title-err" : undefined} data-testid="input-review-title" />
        {show("title")}
      </div>
      <div>
        <label htmlFor={`rv-body-${productId}`}>Your review (required)</label>
        <textarea required aria-required="true" id={`rv-body-${productId}`} maxLength={3000} value={draft.body} onChange={(e) => edit({ body: e.target.value })} disabled={busy} aria-invalid={touched && !!errors.body} aria-describedby={touched && errors.body ? "rv-body-err" : undefined} data-testid="input-review-body" />
        <div className="rv-count">{draft.body.length} / 3000</div>
        {show("body")}
      </div>
      {needsName ? (
        <div>
          <label htmlFor={`rv-name-${productId}`}>Display name (required)</label>
          <input id={`rv-name-${productId}`} type="text" required aria-required="true" maxLength={80} value={draft.displayName} autoComplete="given-name" onChange={(e) => edit({ displayName: e.target.value })} disabled={busy} aria-invalid={touched && !!errors.displayName} aria-describedby={touched && errors.displayName ? "rv-displayName-err" : undefined} data-testid="input-review-name" />
          {show("displayName")}
          <p className="rv-meta">Shown publicly next to your review. We never ask for or show your email.</p>
        </div>
      ) : (
        <div>
          <span className="rv-label">Posting as</span>
          <p className="rv-name-static" data-testid="text-review-name">{signedName}</p>
          <p className="rv-meta">Your account name is shown publicly. We never show your email.</p>
        </div>
      )}
      {error && <div className="rv-banner" role="alert" data-testid="text-review-error">{error}{stale && <> <button className="rv-btn alt" type="button" disabled={busy} onClick={() => void reload()} data-testid="button-reload-review">Load latest version</button></>}</div>}
      <div className="rv-actions">
        <button className="rv-btn" type="submit" disabled={busy || stale} data-testid="button-submit-review">{busy ? "Sending..." : error && !stale ? "Retry sending review" : isEdit ? "Save changes" : "Submit review"}</button>
        {isEdit && <button className="rv-btn alt" type="button" disabled={busy} onClick={onClose} data-testid="button-cancel-edit">Cancel</button>}
      </div>
      <p className="rv-meta">Reviews are checked before they appear on the product page.</p>
    </form>
  );
}

function ReviewAccessPanel({ productId }: { productId: number }) {
  const ctx = useContext(ReviewsContext);
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  // Freeze the revision being edited. A background eligibility refresh must
  // not replace unsaved text or silently turn a stale edit into an overwrite.
  const [editingReview, setEditingReview] = useState<OwnProductReview | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [saved, setSaved] = useState("");
  const lastUser = useRef<string | null>(null);
  const userId = ctx?.access.userId ?? null;
  useEffect(() => { if (lastUser.current !== userId) { lastUser.current = userId; setEditing(false); setEditErr(""); } }, [userId]);
  if (!ctx) return null;
  const { access } = ctx;
  const q = access.query;
  const shell = (children: ReactNode) => <div className="rv-side" id={`rv-panel-${productId}`} data-testid="panel-review-access"><div role="status" aria-live="polite">{saved && <p className="rv-ok" data-testid="text-review-saved">{saved}</p>}</div>{children}</div>;
  if (!access.loaded) return shell(<div className="rv-skel" aria-label="Checking sign-in status" role="status" />);
  const q0 = access.query;
  const signInGate = (
    <div className="rv-gate" data-testid="panel-review-signin">
      <h3>Verified purchasers only</h3>
      <p>Sign in to review this product.</p>
      <button className="rv-btn" type="button" onClick={() => navigate(`/account?redirect_url=${encodeURIComponent(`${window.location.pathname}#product-reviews`)}`)} data-testid="button-review-signin">Sign in</button>
    </div>);
  if (!access.signedIn || !userId || (q0.isError && (q0.error as { status?: number } | null)?.status === 401)) return shell(signInGate);
  if (q.isLoading || (q.isFetching && !q.data && !q.isError)) return shell(<div className="rv-skel" role="status" aria-label="Checking whether you can review this product" data-testid="status-review-access-loading" />);
  const status = (q.error as { status?: number } | null)?.status;
  if (q.isError && status === 403) return shell(<div className="rv-gate" data-testid="panel-review-nonpurchaser"><h3>Reviews are for purchasers</h3><p>Only customers who have bought this product can review it. Once you have a completed purchase, you can share your thoughts here.</p></div>);
  if (q.isError || !q.data) return shell(<div className="rv-banner" role="alert" data-testid="panel-review-access-error">{status === 401 ? "Your session could not be confirmed. Please sign in again." : "We could not check whether you can review this product."} <button className="rv-btn alt" type="button" onClick={() => void q.refetch()} data-testid="button-retry-access">Try again</button></div>);
  if (!q.data.eligible) return shell(<div className="rv-gate" data-testid="panel-review-nonpurchaser"><h3>Reviews are for purchasers</h3><p>Only customers who have bought this product can review it. Once you have a completed purchase, you can share your thoughts here.</p></div>);
  const review = q.data.review;
  async function reloadLatest(storeKey: string) {
    const r = await q.refetch();
    if (r.isError || !r.data?.eligible) { setEditErr("The latest version could not be loaded. Your draft was kept. Try again."); return false; }
    try { sessionStorage.removeItem(storeKey); } catch { /* ignore */ }
    setEditingReview(r.data.review); setEditing(!!r.data.review);
    setEditErr(""); setNonce((n) => n + 1); return true;
  }
  async function openEdit() {
    setLoadingEdit(true); setEditErr("");
    const r = await q.refetch();
    setLoadingEdit(false);
    if (r.isError || !r.data?.eligible || !r.data.review) { setEditErr("The latest version of your review could not be loaded. Try again."); return; }
    setEditingReview(r.data.review); setSaved(""); setEditing(true);
  }
  if (!review) return shell(<ReviewForm key={`${userId}-new-${nonce}`} productId={productId} userId={userId} review={null} autoFocus={false} onClose={() => undefined} onSaved={setSaved} onReloadLatest={reloadLatest} />);
  return shell(<>
    {!editing && (
      <div className="rv-own" data-testid="panel-own-review">
        <h3>Your review</h3>
        <p className={`rv-status ${review.status}`} data-testid="text-own-review-status"><strong>{review.status[0].toUpperCase() + review.status.slice(1)}.</strong> {statusText[review.status]}</p>
        <Stars value={review.rating} /><span className="sr-only">{review.rating} out of 5 stars</span>
        <h4>{review.title}</h4><p className="rv-own-body">{review.body}</p>
        {editErr && <p className="rv-err" role="alert">{editErr}</p>}
        <button className="rv-btn" type="button" disabled={loadingEdit} onClick={() => void openEdit()} data-testid="button-edit-review">{loadingEdit ? "Loading latest..." : "Edit your review"}</button>
      </div>
    )}
    {editing && editingReview && <ReviewForm key={`${userId}-${editingReview.revision}-${nonce}`} productId={productId} userId={userId} review={editingReview} autoFocus onClose={() => setEditing(false)} onSaved={setSaved} onReloadLatest={reloadLatest} />}
  </>);
}

export function ProductReviewsSection({ productId }: { productId: number }) {
  const ctx = useContext(ReviewsContext);
  if (!ctx) return null;
  const { data, isLoading, isError, page, setPage, refetch } = ctx;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section className="rv-section container" id="product-reviews" aria-labelledby="rv-heading" data-testid="section-reviews">
      <div className="rv-head">
        <div className="eyebrow">Customer reviews</div>
        <div className="rv-title-row">
          <h2 id="rv-heading">What customers say about</h2>
          <ProductReviewSummary />
        </div>
      </div>
      <div className="rv-grid">
        <div aria-live="polite">
          {isLoading ? <div aria-label="Loading reviews"><div className="rv-skel" /><div className="rv-skel" /></div>
            : isError ? <div className="rv-banner" role="alert">Reviews could not be loaded. <button className="rv-btn alt" type="button" onClick={refetch}>Try again</button></div>
            : !data || data.reviews.length === 0 ? <div className="rv-empty" data-testid="text-reviews-empty"><strong>No reviews yet.</strong><p>Be the first to share how this piece fits and feels.</p></div>
            : <>
              <ol className="rv-list">
                {data.reviews.map((r) => (
                  <li className="rv-item" key={r.id} data-testid={`review-${r.id}`}>
                    <Stars value={r.rating} /><span className="sr-only">{r.rating} out of 5 stars</span>
                    {r.verifiedPurchase === true && <span className="rv-badge" data-testid={`badge-verified-${r.id}`}>Verified Purchase</span>}<h4>{r.title}</h4><p>{r.body}</p>
                    <div className="rv-meta">{r.displayName} &middot; <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></div>
                  </li>
                ))}
              </ol>
              {pages > 1 && (
                <nav className="rv-pager" aria-label="Review pages">
                  <button className="rv-btn alt" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
                  <span>Page {page} of {pages}</span>
                  <button className="rv-btn alt" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button>
                </nav>
              )}
            </>}
        </div>
        <ReviewAccessPanel key={ctx.access.userId ?? "anonymous"} productId={productId} />
      </div>
    </section>
  );
}

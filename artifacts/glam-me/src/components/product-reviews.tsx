import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { submitProductReview, useGetProductReviews, type ProductReviews } from "@workspace/api-client-react";
import "../reviews.css";

type Ctx = { productId: number; page: number; setPage: (page: number) => void; data?: ProductReviews; isLoading: boolean; isError: boolean; refetch: () => void };
const ReviewsContext = createContext<Ctx | null>(null);

export function ProductReviewsProvider({ productId, children }: { productId: number; children: ReactNode }) {
  const [page, setPage] = useState(1);
  const query = useGetProductReviews(productId, { page }, { query: { refetchInterval: 60000, refetchOnWindowFocus: true, refetchOnMount: "always", staleTime: 15000 } });
  const pagesCount = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;
  useEffect(() => { if (query.data && page > pagesCount) setPage(pagesCount); }, [query.data, page, pagesCount]);
  return <ReviewsContext.Provider value={{ productId, page, setPage, data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }}>{children}</ReviewsContext.Provider>;
}

export function Stars({ value }: { value: number }) {
  const r = Math.round(value);
  return <span className="rv-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= r ? "" : "off"}>&#9733;</span>)}</span>;
}

export function focusReviewForm(productId: number) {
  const form = document.getElementById(`rv-form-${productId}`);
  if (!form) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  (form.querySelector<HTMLElement>("input[type=radio]:checked") ?? form.querySelector<HTMLElement>("input[type=radio]"))?.focus({ preventScroll: true });
}

export function ProductReviewSummary() {
  const ctx = useContext(ReviewsContext);
  if (!ctx || !ctx.data) return null;
  const { averageRating, total } = ctx.data;
  if (total === 0) return (
    <div className="rv-summary" data-testid="text-review-summary">
      <span>No reviews yet</span>
      <button type="button" className="rv-linkbtn" onClick={() => focusReviewForm(ctx.productId)}>Write a review</button>
    </div>
  );
  return (
    <div className="rv-summary" data-testid="text-review-summary">
      <Stars value={averageRating} />
      <span>{averageRating.toFixed(1)} out of 5 from {total} {total === 1 ? "review" : "reviews"}</span>
      <a href="#product-reviews">Read reviews</a>
      <button type="button" className="rv-linkbtn" onClick={() => focusReviewForm(ctx.productId)}>Write a review</button>
    </div>
  );
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
const key = (id: number) => `glam-review-draft-${id}`;
function load(id: number): ReviewDraft {
  try { const raw = sessionStorage.getItem(key(id)); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch { /* ignore */ }
  return blank();
}

function ReviewForm({ productId }: { productId: number }) {
  const qc = useQueryClient();
  const { user } = useUser();
  const [draft, setDraft] = useState<ReviewDraft>(() => load(productId));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inflight = useRef(false);
  const signedName = user?.firstName || user?.username || "";
  const needsName = !signedName;

  useEffect(() => { try { sessionStorage.setItem(key(productId), JSON.stringify(draft)); } catch { /* ignore */ } }, [draft, productId]);
  const edit = (patch: Partial<ReviewDraft>) => { setSuccess(""); setDraft((d) => ({ ...d, ...patch, ...(d.errored ? { submissionId: newId(), errored: false } : {}) })); };
  const errors = validateReview({ ...draft, displayName: needsName ? draft.displayName : "" }, needsName);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inflight.current) return;
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
    try {
      const name = needsName ? draft.displayName.trim() : "";
      const res = await submitProductReview(productId, { rating: draft.rating, title: draft.title.trim(), body: draft.body.trim(), submissionId: draft.submissionId, ...(name ? { displayName: name } : {}) });
      try { sessionStorage.removeItem(key(productId)); } catch { /* ignore */ }
      setDraft(blank()); setTouched(false);
      setSuccess(res?.message || "Thank you. Your review has been received and will appear once approved.");
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/reviews") });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      setDraft((d) => ({ ...d, errored: true }));
      setError(status === 429 ? "Too many attempts. Please wait a moment and try again." : status === 400 || status === 422 ? "The server could not accept this review. Please check your entries and try again." : status === 409 ? "This review conflicts with an earlier attempt. Please reload the page or start a new draft." : "We could not confirm your review was sent. Retrying is safe and will not create a duplicate.");
    } finally { inflight.current = false; setBusy(false); }
  }
  const show = (k: keyof typeof errors) => (touched && errors[k] ? <p className="rv-err" id={`rv-${k}-err`}>{errors[k]}</p> : null);
  return (
    <form className="rv-form" onSubmit={(e) => void submit(e)} noValidate aria-busy={busy} id={`rv-form-${productId}`} data-testid="form-review">
      <h3>Write a review</h3>
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
      {error && <div className="rv-banner" role="alert" data-testid="text-review-error">{error}</div>}
      <button className="rv-btn" type="submit" disabled={busy} data-testid="button-submit-review">{busy ? "Sending..." : error ? "Retry sending review" : "Submit review"}</button>
      <p className="rv-meta">Reviews are checked before they appear on the product page.</p>
    </form>
  );
}

export function ProductReviewsSection({ productId, productName }: { productId: number; productName: string }) {
  const ctx = useContext(ReviewsContext);
  if (!ctx) return null;
  const { data, isLoading, isError, page, setPage, refetch } = ctx;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section className="rv-section container" id="product-reviews" aria-labelledby="rv-heading" data-testid="section-reviews">
      <div className="rv-head">
        <div><div className="eyebrow">Customer reviews</div><h2 id="rv-heading">What customers say about {productName}</h2></div>
        <div><ProductReviewSummary /><button className="rv-btn" type="button" onClick={() => focusReviewForm(productId)} data-testid="button-write-review">Write a review</button></div>
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
                    <h4>{r.title}</h4><p>{r.body}</p>
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
        <ReviewForm productId={productId} />
      </div>
    </section>
  );
}

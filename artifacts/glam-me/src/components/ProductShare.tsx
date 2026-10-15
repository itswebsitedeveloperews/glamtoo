import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { copyProductShareLink, nativeProductShare, productShareLinks, resolveProductShare } from "../utils/product-sharing";

export default function ProductShare({ name, slug, image }: { name: string; slug: string; image: string }) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  const productPath = `/product/${encodeURIComponent(slug)}`;
  const query = useQuery({
    queryKey: ["product-sharing", productPath, name, image],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/seo/resolve?${new URLSearchParams({ path: productPath })}`, {
        signal, credentials: "omit", headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("The public sharing link is temporarily unavailable.");
      return resolveProductShare(await response.json(), name, productPath);
    },
    enabled: typeof window !== "undefined",
    staleTime: 60000,
    retry: false,
  });
  const data = query.data;
  const links = data ? productShareLinks(data) : null;

  useEffect(() => {
    if (!open) return;
    firstOption.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, data]);

  useEffect(() => {
    if (manualCopy) { manualInput.current?.focus(); manualInput.current?.select(); }
  }, [manualCopy]);

  async function share() {
    setMessage("");
    setManualCopy(false);
    if (open) { setOpen(false); return; }
    if (data && window.matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function") {
      setBusy(true);
      const outcome = await nativeProductShare(data, navigator);
      setBusy(false);
      if (outcome === "fallback") setOpen(true);
    } else setOpen(true);
  }

  async function copy() {
    if (!data) return;
    setCopying(true);
    setMessage("");
    try {
      await copyProductShareLink(data, navigator.clipboard);
      setManualCopy(false);
      setMessage("Link copied");
    } catch {
      setManualCopy(true);
      setMessage("Please select and copy the link below.");
    } finally { setCopying(false); }
  }

  return <div className="product-share" ref={root}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      }
    }}>
    <button ref={trigger} className="product-share-trigger" type="button"
      aria-label={`Share ${name}`} aria-expanded={open} aria-controls={open ? panelId : undefined}
      disabled={busy} aria-busy={busy} onClick={() => void share()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </svg>
      {busy ? "Sharing…" : "Share"}
    </button>
    {open && <div id={panelId} className="product-share-panel" role="group" aria-label={`Sharing options for ${name}`}>
      <div className="product-share-panel-heading">Share this piece</div>
      {data && links ? <>
        <div className="product-share-options">
          <button ref={firstOption} className="product-share-option" type="button" onClick={() => void copy()} disabled={copying}>
            {copying ? "Copying…" : "Copy Link"}
          </button>
          <a className="product-share-option" href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Share ${name} on WhatsApp (opens a new tab)`}>WhatsApp</a>
          <a className="product-share-option" href={links.facebook} target="_blank" rel="noopener noreferrer" aria-label={`Share ${name} on Facebook (opens a new tab)`}>Facebook</a>
          {links.pinterest
            ? <a className="product-share-option" href={links.pinterest} target="_blank" rel="noopener noreferrer" aria-label={`Share ${name} on Pinterest (opens a new tab)`}>Pinterest</a>
            : <span className="product-share-option" aria-disabled="true">Pinterest unavailable</span>}
        </div>
        {manualCopy && <label className="product-share-manual">Product link
          <input ref={manualInput} readOnly value={data.url} onFocus={event => event.currentTarget.select()} />
        </label>}
      </> : query.isError ? <div role="alert" className="product-share-feedback">
        Sharing is temporarily unavailable. <button ref={firstOption} type="button" className="product-share-option" onClick={() => void query.refetch()}>Try again</button>
      </div> : <p className="product-share-feedback" role="status">Preparing share link…</p>}
      <div className="product-share-feedback" role="status" aria-live="polite">{message}</div>
    </div>}
  </div>;
}

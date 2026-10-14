import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCatalogMediaSource } from "@/data/catalog";
import { CollectionTile, MomentCard, type PromotionalCategory, type PromotionalProduct } from "./PromotionalCards";
import "./AdminPromotionalPreview.css";

// An independent viewport is essential: a narrow div still uses the admin
// window's desktop media queries. Copy the real styles, not a preview imitation.
function PreviewViewport({ categories, moments, width }: {
  categories: PromotionalCategory[]; moments: PromotionalProduct[]; width: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(width);
  const [height, setHeight] = useState(500);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const sources = [...categories, ...moments].map(item => getCatalogMediaSource(item.image));
  const hasFailedImage = failedImages.some(source => sources.includes(source));
  const scale = Math.min(1, availableWidth / width);

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    const observer = new ResizeObserver(() => setHeight(Math.ceil(target.getBoundingClientRect().height)));
    observer.observe(target);
    return () => observer.disconnect();
  }, [target]);

  function initialize() {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    doc.head.replaceChildren();
    const base = doc.createElement("base");
    base.href = document.baseURI;
    doc.head.append(base);
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => doc.head.append(node.cloneNode(true)));
    // No preview-specific promotional styling: only disable interactions and
    // animations so pointer position cannot change the crop being inspected.
    const style = doc.createElement("style");
    style.textContent = "html { overflow: hidden; } body { margin: 0; } #root { display: flow-root; pointer-events: none; } #root * { transition: none !important; }";
    doc.head.append(style);
    const root = doc.createElement("div");
    root.id = "root";
    root.inert = true;
    doc.body.replaceChildren(root);
    setTarget(root);
  }

  return (
    <>
    {hasFailedImage && <p role="alert">An image could not load. Check its URL or select another photo before saving.</p>}
    <div ref={host} className="admin-promo-viewport" style={{ height: height * scale }}>
      <iframe ref={iframe} title={`${width === 390 ? "Mobile" : "Desktop"} promotional crop preview`}
        srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
        onLoad={initialize} tabIndex={-1}
        style={{ width, height, transform: `scale(${scale})` }} />
      {target && createPortal(
        <div onErrorCapture={event => {
          const image = event.target as HTMLImageElement;
          if (image.tagName === "IMG") setFailedImages(current => current.includes(image.getAttribute("src") ?? "") ? current : [...current, image.getAttribute("src") ?? ""]);
        }}>
          {categories.length > 0 && <section className={`container collection-collage${categories.length >= 5 ? " is-five-or-more" : ""}`}>
            <h2 className="sr-only">Shop the collection</h2>
            {categories.map(category => <CollectionTile key={category.id} category={{ ...category, image: getCatalogMediaSource(category.image) }} readOnly />)}
          </section>}
          {moments.length > 0 && <section className="moments"><div className="container"><div className="moment-grid">
            {moments.map((product, index) => <MomentCard key={product.id} product={{ ...product, image: getCatalogMediaSource(product.image) }} index={index} readOnly />)}
          </div></div></section>}
        </div>, target)}
    </div>
    </>
  );
}

export default function AdminPromotionalPreview({ categories = [], moments = [], note }: {
  categories?: PromotionalCategory[]; moments?: PromotionalProduct[]; note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile");
  return (
    <details className="admin-promo-preview" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Preview homepage crops</summary>
      {open && <>
        <p>Read-only preview of the current draft, with storefront overlays and text backplates. Check faces, hems, and garments before saving. Nothing is saved here.</p>
        {note && <p>{note}</p>}
        <div className="admin-promo-devices" role="group" aria-label="Preview viewport">
          <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile · 390px</button>
          <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop · 1280px</button>
        </div>
        <p className="admin-promo-caption">Scaled to fit this panel. Switch views to compare crops; previews cannot be clicked.</p>
        {categories.length || moments.length
          ? <PreviewViewport categories={categories} moments={moments} width={device === "mobile" ? 390 : 1280} />
          : <p>No promotional items selected. Empty sections will stay hidden.</p>}
      </>}
    </details>
  );
}

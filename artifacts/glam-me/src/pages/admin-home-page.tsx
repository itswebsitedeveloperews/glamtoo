import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { CatalogCategory, CatalogProduct } from "@/data/catalog";
import { defaultHomePageSettings, type HomePageSettings } from "@/data/home-page";
import AdminPromotionalPreview from "@/components/AdminPromotionalPreview";

type SettingsField = keyof HomePageSettings;
type Choice = { id: number; label: string; detail?: string };

function SelectionDropdown({
  title, description, choices, selected, onChange, maxSelections,
}: {
  title: string;
  description: string;
  choices: Choice[];
  selected: number[];
  onChange: (ids: number[]) => void;
  maxSelections?: number;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; pointerId: number } | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; after: boolean } | null>(null);

  function targetAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-home-chip-id]");
    if (!element || !selectedRef.current?.contains(element)) return null;
    return {
      id: Number(element.dataset.homeChipId),
      after: x >= element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2,
    };
  }

  function move(id: number, targetId: number, after: boolean) {
    if (id === targetId) return;
    const next = selected.filter((item) => item !== id);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex === -1) return;
    next.splice(targetIndex + (after ? 1 : 0), 0, id);
    onChange(next);
  }

  function finishDrag() {
    dragRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
  }

  useEffect(() => {
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, []);
  const names = new Map(choices.map((choice) => [choice.id, choice.label]));
  return (
    <div className="admin-home-field">
      <h2>{title}</h2>
      <p>{description}</p>
      <details ref={detailsRef} className="admin-home-dropdown">
        <summary>{selected.length ? `${selected.length} selected` : "Select items"}</summary>
        <div className="admin-home-options">
          {choices.length === 0 && <p>No published items available.</p>}
          {choices.map((choice) => (
            <label key={choice.id}>
              <input type="checkbox" checked={selected.includes(choice.id)} disabled={maxSelections !== undefined && selected.length >= maxSelections && !selected.includes(choice.id)} onChange={(event) => onChange(event.target.checked ? [...selected, choice.id] : selected.filter((id) => id !== choice.id))} />
              <span>{choice.label}{choice.detail && <small>{choice.detail}</small>}</span>
            </label>
          ))}
        </div>
      </details>
      {selected.length > 0 && <div ref={selectedRef} className="admin-home-selected" role="list" aria-label={`Selected ${title}, drag items or use arrow keys to change order`}>
        {selected.map((id, index) => (
          <div
            key={id}
            role="listitem"
            data-home-chip-id={id}
            className={`admin-home-chip${draggedId === id ? " is-dragging" : ""}${dropTarget?.id === id ? ` is-drop-${dropTarget.after ? "after" : "before"}` : ""}`}
            onPointerDown={(event) => {
              if ((event.target as Element).closest(".admin-home-remove") || (event.pointerType === "mouse" && event.button !== 0)) return;
              dragRef.current = { id, pointerId: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId);
              setDraggedId(id);
            }}
            onPointerMove={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              const target = targetAt(event.clientX, event.clientY);
              const nextTarget = target?.id === id ? null : target;
              setDropTarget((current) => current?.id === nextTarget?.id && current?.after === nextTarget?.after ? current : nextTarget);
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) {
                const target = targetAt(event.clientX, event.clientY);
                if (target) move(dragRef.current.id, target.id, target.after);
              }
              finishDrag();
            }}
            onPointerCancel={finishDrag}
            onLostPointerCapture={finishDrag}
          >
            <button
              type="button"
              className="admin-home-drag-handle"
              aria-label={`Reorder ${names.get(id) ?? `item ${id}`}, position ${index + 1} of ${selected.length}. Drag, or use arrow keys to change order.`}
              title="Drag to reorder, or use arrow keys"
              onKeyDown={(event) => {
                const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
                if (!direction) return;
                event.preventDefault();
                const index = selected.indexOf(id);
                const swapIndex = index + direction;
                if (swapIndex < 0 || swapIndex >= selected.length) return;
                const next = [...selected];
                [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
                onChange(next);
              }}
            ><GripVertical size={16} aria-hidden="true" /></button>
            <span>{names.get(id) ?? `Unavailable item ${id}`}</span>
            <button type="button" className="admin-home-remove" onClick={() => onChange(selected.filter((item) => item !== id))} aria-label={`Remove ${names.get(id) ?? `item ${id}`} from ${title}`}>×</button>
          </div>
        ))}
      </div>}
    </div>
  );
}

export default function AdminHomePage({ categories, products, onSaved }: { categories: CatalogCategory[]; products: CatalogProduct[]; onSaved?: (settings: HomePageSettings) => void }) {
  const [draft, setDraft] = useState<HomePageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/catalog", { credentials: "include", cache: "no-store" });
        const payload = await response.json() as { homePage?: HomePageSettings | null; categories?: CatalogCategory[]; products?: CatalogProduct[]; error?: string };
        if (!response.ok || !payload.categories || !payload.products) throw new Error(payload.error || "Home page settings could not be loaded.");
        if (active) setDraft(payload.homePage ?? defaultHomePageSettings(payload.categories, payload.products));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Home page settings could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function update(field: SettingsField, ids: number[]) {
    setDraft((current) => current ? { ...current, [field]: ids } : current);
    setSaved(false);
    setError("");
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/catalog/home-page", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as { homePage?: HomePageSettings; error?: string };
      if (!response.ok || !payload.homePage) throw new Error(payload.error || "Home page settings could not be saved.");
      setDraft(payload.homePage);
      onSaved?.(payload.homePage);
      setSaved(true);
      window.dispatchEvent(new Event("glam-catalog-updated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Home page settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const categoryChoices = categories.map((category) => ({
    id: category.id, label: category.name,
    detail: category.parentId ? `In ${categories.find((parent) => parent.id === category.parentId)?.name ?? "another category"}` : "Main category",
  }));
  const productChoices = products.filter((product) => product.status === "Published").map((product) => ({
    id: product.id, label: product.name, detail: product.category,
  }));

  return (
    <>
      <div className="admin-section-title">
        <div><p className="admin-eyebrow">Storefront</p><h1>Home Page</h1><p>Choose the categories and products featured on the storefront home page.</p></div>
      </div>
      <section className="admin-panel admin-home-panel">
        {loading ? <p role="status">Loading home page settings…</p> : draft && <>
          <SelectionDropdown title="Category Section" description="Choose up to five categories for the image tiles, in display order." choices={categoryChoices} selected={draft.categoryIds} onChange={(ids) => update("categoryIds", ids)} maxSelections={5} />
          <SelectionDropdown title="Obsessions Section" description="Choose up to three published products, in display order." choices={productChoices} selected={draft.obsessionIds} onChange={(ids) => update("obsessionIds", ids)} maxSelections={3} />
          <SelectionDropdown title="Outfits Plan Section" description="Choose up to four published products, in display order." choices={productChoices} selected={draft.momentIds} onChange={(ids) => update("momentIds", ids)} maxSelections={4} />
          <AdminPromotionalPreview
            categories={draft.categoryIds.flatMap(id => categories.filter(category => category.id === id))}
            moments={draft.momentIds.flatMap(id => products.filter(product => product.id === id && product.status === "Published"))}
            note="To replace a photo, edit its category or the product’s primary image. Selection and order changes above appear here before you save."
          />
          <div className="admin-home-actions">
            <button className="admin-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Home Page"}</button>
            {saved && <span role="status">Home page saved.</span>}
          </div>
        </>}
        {error && <p className="admin-home-error" role="alert">{error}</p>}
      </section>
    </>
  );
}
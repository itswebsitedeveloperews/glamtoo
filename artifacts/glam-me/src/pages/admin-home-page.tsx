import { useEffect, useState } from "react";
import type { CatalogCategory, CatalogProduct } from "@/data/catalog";
import { defaultHomePageSettings, type HomePageSettings } from "@/data/home-page";

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
  const names = new Map(choices.map((choice) => [choice.id, choice.label]));
  return (
    <div className="admin-home-field">
      <h2>{title}</h2>
      <p>{description}</p>
      <details className="admin-home-dropdown">
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
      {selected.length > 0 && <div className="admin-home-selected" aria-label={`Selected ${title}`}>
        {selected.map((id) => (
          <button type="button" key={id} onClick={() => onChange(selected.filter((item) => item !== id))} aria-label={`Remove ${names.get(id) ?? `item ${id}`} from ${title}`}>
            {names.get(id) ?? `Unavailable item ${id}`} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>}
    </div>
  );
}

export default function AdminHomePage({ categories, products }: { categories: CatalogCategory[]; products: CatalogProduct[] }) {
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
          <SelectionDropdown title="Category select" description="Choose categories for the image tiles. The order you select them is the order they appear." choices={categoryChoices} selected={draft.categoryIds} onChange={(ids) => update("categoryIds", ids)} />
          <SelectionDropdown title="Our Current Obsessions" description="Choose the published products for this section." choices={productChoices} selected={draft.obsessionIds} onChange={(ids) => update("obsessionIds", ids)} />
          <SelectionDropdown title="Outfits for Every Plan" description="Choose up to four published products, in display order." choices={productChoices} selected={draft.momentIds} onChange={(ids) => update("momentIds", ids)} maxSelections={4} />
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
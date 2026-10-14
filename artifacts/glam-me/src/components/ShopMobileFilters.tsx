import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns2, List, SlidersHorizontal, X } from 'lucide-react';

export type ShopFilterValues = {
  category: string;
  sort: string;
  stock: '' | 'in' | 'out';
  min: number;
  max: number;
};

type StockCounts = Record<string, { inStock: number; outOfStock: number }>;

type Props = {
  applied: ShopFilterValues;
  counts: StockCounts;
  priceCeiling: number;
  view: 'cards' | 'list';
  onViewChange: (view: 'cards' | 'list') => void;
  onApply: (filters: ShopFilterValues) => void;
};

const sortChoices = [
  { value: 'new', label: 'Featured order' },
  { value: 'bestsellers', label: 'Bestsellers' },
  { value: 'price-asc', label: 'Price, low to high' },
];

export default function ShopMobileFilters({ applied, counts, priceCeiling, view, onViewChange, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [stockChecks, setStockChecks] = useState({ inStock: false, outOfStock: false });
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const selectedCounts = counts[draft.category] ?? { inStock: 0, outOfStock: 0 };
  const activeFilters = Boolean(applied.stock || applied.min > 0 || applied.max < priceCeiling || applied.category);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  function openFilters() {
    setDraft(applied);
    setStockChecks({ inStock: applied.stock === 'in', outOfStock: applied.stock === 'out' });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('.shop-filter-close')?.focus();
    function handleKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), select, input:not(:disabled), summary'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeys);
    };
  }, [open]);

  return (
    <>
      <div className="shop-mobile-controls">
        <button ref={opener} type="button" className="shop-filter-trigger" onClick={openFilters} aria-haspopup="dialog">
          <SlidersHorizontal size={17} strokeWidth={1.7} aria-hidden="true" /> Filter{activeFilters && <span className="shop-filter-indicator" aria-hidden="true" />}
        </button>
        <div className="shop-view-controls" role="group" aria-label="Product view">
          <button type="button" className={view === 'list' ? 'is-active' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}><List size={18} aria-hidden="true" /></button>
          <button type="button" className={view === 'cards' ? 'is-active' : ''} aria-label="Card view" aria-pressed={view === 'cards'} onClick={() => onViewChange('cards')}><Columns2 size={18} aria-hidden="true" /></button>
        </div>
      </div>
      {open && createPortal(
        <div className="shop-filter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div ref={dialog} className="shop-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-filter-title">
            <div className="shop-filter-heading">
              <h2 id="shop-filter-title">Filter</h2>
              <button type="button" className="shop-filter-close" aria-label="Close filters" onClick={close}><X size={22} strokeWidth={1.6} /></button>
            </div>
            <label className="shop-filter-sort">
              <span>Sort by:</span>
              <select value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value })}>
                {sortChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            </label>
            <fieldset className="shop-filter-section">
              <legend>Availability</legend>
              <label><input type="checkbox" checked={stockChecks.inStock} onChange={(event) => setStockChecks({ ...stockChecks, inStock: event.target.checked })} /> In stock ({selectedCounts.inStock})</label>
              <label><input type="checkbox" checked={stockChecks.outOfStock} onChange={(event) => setStockChecks({ ...stockChecks, outOfStock: event.target.checked })} /> Out of stock ({selectedCounts.outOfStock})</label>
            </fieldset>
            <fieldset className="shop-filter-section shop-filter-price">
              <legend>Price</legend>
              <div className="shop-range">
                <div className="shop-range-track"><span style={{ left: `${draft.min / priceCeiling * 100}%`, right: `${(1 - draft.max / priceCeiling) * 100}%` }} /></div>
                <input type="range" min={0} max={priceCeiling} value={draft.min} aria-label="Minimum price" onChange={(event) => setDraft({ ...draft, min: Math.min(Number(event.target.value), draft.max) })} />
                <input type="range" min={0} max={priceCeiling} value={draft.max} aria-label="Maximum price" onChange={(event) => setDraft({ ...draft, max: Math.max(Number(event.target.value), draft.min) })} />
              </div>
              <div className="shop-price-fields">
                <label>£ <input type="number" min={0} max={draft.max} step="0.01" aria-label="Minimum price in pounds" value={draft.min} onChange={(event) => setDraft({ ...draft, min: Math.min(draft.max, Math.max(0, Number(event.target.value) || 0)) })} /></label>
                <span>To</span>
                <label>£ <input type="number" min={draft.min} max={priceCeiling} step="0.01" aria-label="Maximum price in pounds" value={draft.max} onChange={(event) => setDraft({ ...draft, max: Math.min(priceCeiling, Math.max(draft.min, Number(event.target.value) || 0)) })} /></label>
              </div>
            </fieldset>
            <button type="button" className="shop-filter-apply" onClick={() => {
              onApply({ ...draft, stock: stockChecks.inStock === stockChecks.outOfStock ? '' : stockChecks.inStock ? 'in' : 'out' });
              close();
            }}>Apply</button>
          </div>
        </div>, document.body,
      )}
    </>
  );
}
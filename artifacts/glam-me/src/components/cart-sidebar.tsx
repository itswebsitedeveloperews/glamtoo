import { type ReactNode } from 'react';
import { ProductListingImage } from './product-listing-image';
import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';

export type CartSidebarLine = {
  key: string;
  name: string;
  href: string;
  image?: string;
  imagePosition?: string;
  options: string[];
  unitLabel: string;
  lineLabel: string;
  quantity: number;
  maxQuantity: number;
  /** Product or option can no longer be bought; the line is kept so it can be removed. */
  unavailable: boolean;
  notice?: string;
};

export type CartSidebarRecommendation = {
  id: number;
  name: string;
  href: string;
  image?: string;
  galleryImages?: string[];
  imagePosition?: string;
  priceLabel: string;
  canQuickAdd: boolean;
};

type CartSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  lines: CartSidebarLine[];
  subtotalLabel: string;
  hasUnavailable: boolean;
  error: string;
  recommendations: CartSidebarRecommendation[];
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onQuickAdd: (productId: number) => void;
  onNavigate: () => void;
};

function Thumb({ src, alt }: { src?: string; alt: string }): ReactNode {
  return src
    ? <img src={src} alt={alt} loading="lazy" decoding="async" style={{ objectPosition: 'top' }} />
    : <span className="cart-drawer-thumb-empty" aria-hidden="true" />;
}

export default function CartSidebar(props: CartSidebarProps) {
  const { open, onOpenChange, itemCount, lines, subtotalLabel, hasUnavailable, error, recommendations } = props;
  const blocked = lines.length === 0 || hasUnavailable || lines.some((l) => l.quantity > l.maxQuantity) || Boolean(error);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className="cart-fab" aria-label={`Open bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`} data-testid="button-cart-fab">
        <ShoppingBag size={24} aria-hidden="true" />
        {itemCount > 0 && <span className="cart-fab-count" aria-hidden="true">{itemCount}</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cart-drawer-overlay" />
        <Dialog.Content className="cart-drawer" data-testid="drawer-cart">
          <header className="cart-drawer-head">
            <Dialog.Title className="cart-drawer-title">Your bag <span>({itemCount})</span></Dialog.Title>
            <Dialog.Close className="cart-drawer-close" aria-label="Close bag" data-testid="button-cart-close"><X size={22} aria-hidden="true" /></Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">Review the items in your bag, change quantities, or continue to checkout.</Dialog.Description>
          <div className="cart-drawer-body">
            {error && <p className="cart-drawer-error" role="alert" data-testid="text-cart-error">{error}</p>}
            {lines.length === 0 ? (
              <div className="cart-drawer-empty" data-testid="text-cart-empty">
                <ShoppingBag size={34} aria-hidden="true" />
                <p className="cart-drawer-empty-title">Your bag is empty</p>
                <p>Pieces you add will wait for you here.</p>
                <Dialog.Close className="cart-drawer-btn" data-testid="button-cart-continue">Continue shopping</Dialog.Close>
              </div>
            ) : (
              <ul className="cart-drawer-lines">
                {lines.map((line) => (
                  <li key={line.key} className={`cart-drawer-line${line.unavailable ? ' is-unavailable' : ''}`} data-testid={`row-cart-line-${line.key}`}>
                    <a className="cart-drawer-thumb" href={line.href} onClick={props.onNavigate} tabIndex={-1} aria-hidden="true"><Thumb src={line.image} alt="" /></a>
                    <div className="cart-drawer-info">
                      <a className="cart-drawer-name" href={line.href} onClick={props.onNavigate}>{line.name}</a>
                      {line.options.length > 0 && <p className="cart-drawer-meta">{line.options.join(' / ')}</p>}
                      {line.notice && <p className="cart-drawer-note" role="status">{line.notice}</p>}
                      <div className="cart-drawer-line-foot">
                        {line.unavailable ? (
                          <a className="cart-drawer-link" href="/cart" onClick={props.onNavigate}>View bag</a>
                        ) : (
                          <div className="cart-drawer-qty" role="group" aria-label={`Quantity for ${line.name}`}>
                            <button type="button" aria-label={`Decrease quantity of ${line.name}`} disabled={line.quantity <= 1} onClick={() => props.onQuantityChange(line.key, line.quantity - 1)} data-testid={`button-cart-minus-${line.key}`}><Minus size={16} aria-hidden="true" /></button>
                            <span aria-live="polite" data-testid={`text-cart-qty-${line.key}`}>{line.quantity}</span>
                            <button type="button" aria-label={`Increase quantity of ${line.name}`} disabled={line.quantity >= line.maxQuantity} onClick={() => props.onQuantityChange(line.key, line.quantity + 1)} data-testid={`button-cart-plus-${line.key}`}><Plus size={16} aria-hidden="true" /></button>
                          </div>
                        )}
                        <span className="cart-drawer-price">{line.unavailable ? line.unitLabel : line.lineLabel}</span>
                      </div>
                    </div>
                    <button type="button" className="cart-drawer-remove" aria-label={`Remove ${line.name} from bag`} onClick={() => props.onRemove(line.key)} data-testid={`button-cart-remove-${line.key}`}><Trash2 size={18} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
            {recommendations.length > 0 && (
              <section className="cart-drawer-recs" aria-labelledby="cart-recs-title">
                <h3 id="cart-recs-title">You may also like</h3>
                <ul>
                  {recommendations.map((rec) => (
                    <li key={rec.id} data-testid={`card-cart-rec-${rec.id}`}>
                      <a className="cart-drawer-rec-thumb" href={rec.href} onClick={props.onNavigate} tabIndex={-1} aria-hidden="true">{rec.image ? <ProductListingImage image={rec.image} galleryImages={rec.galleryImages} alt="" position="top" sizes="72px" /> : <Thumb alt="" />}</a>
                      <a className="cart-drawer-rec-name" href={rec.href} onClick={props.onNavigate}>{rec.name}</a>
                      <span className="cart-drawer-rec-price">{rec.priceLabel}</span>
                      {rec.canQuickAdd
                        ? <button type="button" className="cart-drawer-rec-add" onClick={() => props.onQuickAdd(rec.id)} aria-label={`Add ${rec.name} to bag`} data-testid={`button-cart-rec-add-${rec.id}`}>Add</button>
                        : <a className="cart-drawer-rec-add is-link" href={rec.href} onClick={props.onNavigate} aria-label={`Choose options for ${rec.name}`}>Options</a>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <footer className="cart-drawer-foot">
            <div className="cart-drawer-subtotal"><span>Subtotal</span><strong data-testid="text-cart-subtotal">{subtotalLabel}</strong></div>
            <p className="cart-drawer-support">
              {hasUnavailable ? 'Remove unavailable items to continue to checkout.' : 'Prices include VAT. Shipping is calculated at checkout.'}
            </p>
            {blocked
              ? <span className="cart-drawer-btn is-disabled" role="link" aria-disabled="true" data-testid="link-cart-checkout-disabled">Checkout</span>
              : <a className="cart-drawer-btn" href="/checkout" onClick={props.onNavigate} data-testid="link-cart-checkout">Checkout</a>}
            <a className="cart-drawer-btn is-secondary" href="/cart" onClick={props.onNavigate} data-testid="link-cart-view">View bag</a>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

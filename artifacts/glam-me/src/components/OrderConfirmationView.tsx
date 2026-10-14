import type { ReactNode } from 'react';
import './OrderConfirmationView.css';

export type OrderReceipt = {
  accountCreation?: 'created' | 'existing' | 'pending';
  id: string;
  placedAt: string | null;
  status: string;
  paymentStatus?: string;
  paymentResolution?: 'none' | 'refund_pending' | 'refund_processing' | 'refunded' | 'manual_resolution';
  paymentResolutionReason?: 'inventory_reallocated' | 'coupon_reallocated' | 'inventory_and_coupon_reallocated' | null;
  paymentResolvedAt?: string | null;
  total: number;
  currency: string;
  email: string;
  couponCode?: string | null;
  discountAmount?: number;
  subtotal?: number;
  deliveryAmount?: number;
  vatAmount?: number;
  delivery: {
    method: string;
    name: string;
    address: { line1: string; line2: string; city: string; postcode: string; country: string };
  };
  items: Array<{ name: string; productId: string | null; variationId?: string | null; quantity: number; total: number }>;
};

type Props = {
  state: 'confirming' | 'confirmed' | 'error' | 'missing';
  order: OrderReceipt | null;
  isSignedIn: boolean;
  error: string;
  resolutionCopy?: { title: string; detail: string };
  onRetry: () => void;
};

const Icon = ({ d }: { d: string }) => (
  <span className="ocv-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={d} /></svg></span>
);
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const ALERT = 'M12 6v7M12 17.5v.01';
const DOTS = 'M6 12h.01M12 12h.01M18 12h.01';

function money(n: number, currency: string) {
  // Saved orders use integer minor units, just like the account order view.
  const amount = n / 100;
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
}

function Head({ icon, eyebrow, title, children }: { icon: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="ocv-head">
      <Icon d={icon} />
      <div>
        <p className="ocv-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </header>
  );
}

function Receipt({ order }: { order: OrderReceipt }) {
  const c = order.currency;
  const a = order.delivery.address;
  const rows: Array<[string, number | undefined]> = [
    ['Subtotal', order.subtotal],
    ['Delivery', order.deliveryAmount],
    [order.couponCode ? `Discount (${order.couponCode})` : 'Discount', order.discountAmount && order.discountAmount > 0 ? -order.discountAmount : order.discountAmount],
    ['VAT included', order.vatAmount],
  ];
  const addr = [a.line1, a.line2, a.city, a.postcode, a.country === 'GB' ? 'United Kingdom' : a.country].filter(Boolean);
  return (
    <div className="ocv-grid">
      <section className="ocv-card" aria-labelledby="ocv-items-h">
        <h2 id="ocv-items-h">Your items</h2>
        <ul className="ocv-items">
          {order.items.map((it, i) => (
            <li key={`${it.productId ?? 'x'}-${it.variationId ?? ''}-${i}`}>
              <span>{it.name}<small>Quantity {it.quantity}</small></span>
              <span className="ocv-num">{money(it.total, c)}</span>
            </li>
          ))}
        </ul>
        <dl className="ocv-totals">
          {rows.filter(([, v]) => typeof v === 'number').map(([l, v]) => (
            <div key={l}><dt>{l}</dt><dd className="ocv-num">{money(v as number, c)}</dd></div>
          ))}
          <div className="is-total"><dt>Total</dt><dd className="ocv-num">{money(order.total, c)}</dd></div>
        </dl>
      </section>
      <aside>
        <section className="ocv-card" aria-labelledby="ocv-del-h">
          <h2 id="ocv-del-h">Delivery address</h2>
          <address>
            <strong>{order.delivery.name}</strong>
            {addr.map((l, i) => <div key={i}>{l}</div>)}
          </address>
        </section>
        <section className="ocv-card" aria-labelledby="ocv-ord-h">
          <h2 id="ocv-ord-h">Order details</h2>
          <p className="ocv-muted" style={{ margin: 0 }}>Billing email</p>
          <p style={{ margin: 0 }}>{order.email}</p>
        </section>
      </aside>
    </div>
  );
}

export default function OrderConfirmationView({ state, order, isSignedIn, error, resolutionCopy, onRetry }: Props) {
  const help = isSignedIn
    ? { href: '/account', label: 'View my orders' }
    : { href: '/contact', label: 'Contact us' };

  if (state === 'confirming') {
    return (
      <div className="ocv" role="status" aria-live="polite" aria-busy="true">
        <Head icon={DOTS} eyebrow="Confirming payment" title="One moment.">
          <p>We&apos;re checking your payment and saving your order securely. Please keep this page open.</p>
          <div aria-hidden="true"><div className="ocv-skel" /><div className="ocv-skel" style={{ width: '60%' }} /></div>
        </Head>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="ocv">
        <Head icon={ALERT} eyebrow="Order confirmation" title="We're confirming your order.">
          <p>Your card payment may have succeeded, but we have not yet received a saved order confirmation. Your bag has been kept safe. Refresh this page in a moment to check again.</p>
          {error && <p className="ocv-alert" role="alert">{error}</p>}
          <div className="ocv-actions">
            <button className="ocv-btn" type="button" onClick={onRetry}>Check my order</button>
            <a className="ocv-link" href="/contact">Contact us for help</a>
          </div>
        </Head>
      </div>
    );
  }

  if (state === 'missing' || !order) {
    return (
      <div className="ocv">
        <Head icon={ALERT} eyebrow="Order confirmation" title="We need your payment reference.">
          <p>{isSignedIn
            ? 'Return to your account to view confirmed orders, or contact us if you have been charged.'
            : 'Contact us with your payment receipt if you have been charged. You do not need an account to get help with a guest order.'}</p>
          <div className="ocv-actions"><a className="ocv-btn" href={help.href}>{help.label}</a></div>
        </Head>
      </div>
    );
  }

  const resolved = Boolean(order.paymentResolution && order.paymentResolution !== 'none');
  const acct = order.accountCreation;

  return (
    <div className="ocv">
      {resolved ? (
        <Head icon={ALERT} eyebrow="Payment received" title={resolutionCopy?.title ?? 'Your payment needs attention.'}>
          <p>{resolutionCopy?.detail ?? 'We are resolving this payment. Contact us if you need help.'}</p>
          <p className="ocv-ref">Reference <b>{order.id}</b></p>
          <p>{isSignedIn ? 'You can check this update any time in your account.' : 'Keep this reference and contact us for help with your guest order.'}</p>
          <div className="ocv-actions"><a className="ocv-btn" href={help.href}>{help.label}</a></div>
        </Head>
      ) : (
        <Head icon={CHECK} eyebrow="Order received" title="Thank you for your order.">
          <p>Your order has been received. Thank you for shopping with Glam Too.</p>
          <p className="ocv-ref">Order reference <b>{order.id}</b></p>
        </Head>
      )}

      {!resolved && <Receipt order={order} />}

      {!resolved && acct && (
        <section className="ocv-card" role="status" data-testid="confirmation-account-status" aria-label="Account status">
          <h2>Your account</h2>
          <p style={{ margin: 0 }}>
            {acct === 'created'
              ? 'Your account has been created using your billing details. Verify your email and set a password to access your account and this order.'
              : acct === 'existing'
                ? 'An account already uses your billing email. Sign in with your existing details. For security, this guest purchase has not been linked to that account automatically.'
                : 'Your purchase is confirmed, but account creation is still pending. Refresh this page to retry account creation without paying again.'}
          </p>
          <div className="ocv-actions">
            {acct === 'created' && <a className="ocv-link" href="/account/recovery">Set your password</a>}
            {acct === 'existing' && <a className="ocv-link" href="/account">Sign in</a>}
            {acct === 'pending' && <button className="ocv-link" type="button" onClick={onRetry}>Retry account creation</button>}
          </div>
        </section>
      )}

      {!resolved && (
        <div className="ocv-actions">
          <a className="ocv-btn" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a>
          {isSignedIn && <a className="ocv-link" href="/account">View my orders</a>}
        </div>
      )}
    </div>
  );
}

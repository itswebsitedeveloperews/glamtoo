import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import fashionImage from '@assets/glam-me-20260814-final-v2_1787646629461.png';
import logoImage from '@assets/glam_me_logo_1787652435373.svg';
import heroImage from '@assets/glam-me-home-banner_1787651354578.png';
import { catalogCategories, catalogProducts, createProductSlug, formatCatalogPrice, type CatalogCategory, type CatalogProduct } from '@/data/catalog';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useSignIn, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { CreditCard, LayoutDashboard, LogOut, MapPin, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';
import AdminDashboard from '@/pages/admin-dashboard';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#e23d6f',
    colorForeground: '#171615',
    colorMutedForeground: '#716a67',
    colorDanger: '#b42342',
    colorBackground: '#fffdfb',
    colorInput: '#f5f1ed',
    colorInputForeground: '#171615',
    colorNeutral: '#d8d0ca',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0px',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: { width: '440px', maxWidth: '100%', overflow: 'hidden', background: '#fffdfb', border: '1px solid #d8d0ca', borderRadius: '0px', boxShadow: '12px 12px 0 rgba(23, 22, 21, .08)' },
    card: { border: '0', background: 'transparent', borderRadius: '0px', boxShadow: 'none' },
    footer: { border: '0', background: 'transparent', borderRadius: '0px', boxShadow: 'none' },
    headerTitle: { color: '#171615' },
    headerSubtitle: { color: '#716a67' },
    formFieldLabel: { color: '#171615' },
    footerActionLink: { color: '#e23d6f' },
    footerActionText: { color: '#716a67' },
    dividerText: { color: '#716a67' },
    formButtonPrimary: { background: '#e23d6f', borderRadius: '0px' },
    formFieldInput: { background: '#f5f1ed', color: '#171615', borderRadius: '0px' },
    socialButtonsBlockButton: { borderRadius: '0px' },
    socialButtonsBlockButtonText: { color: '#171615' },
    dividerLine: { background: '#d8d0ca' },
    logoImage: { height: 'auto', width: '142px' },
  },
};

const adminProductsStorageKey = 'glam-me-admin-products-v4';
const adminCategoriesStorageKey = 'glam-me-admin-categories-v2';
const cartStorageKey = 'glam-me-cart-v1';

type CartItem = {
  productId: number;
  size: string;
  colour?: string;
  variationId?: number;
  quantity: number;
};

type CustomerOrder = {
  id: string;
  placedAt: string | null;
  status: string;
  total: number;
  currency: string;
  email: string;
  delivery: {
    method: string;
    name: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      postcode: string;
      country: string;
    };
  };
  items: Array<{
    name: string;
    productId: string | null;
    quantity: number;
    total: number;
  }>;
};

type AccountSection = "dashboard" | "orders" | "addresses" | "payment-methods" | "account-details";

type CustomerProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
};

type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

const emptyCustomerProfile: CustomerProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  country: "GB",
};

type StripeCardElement = {
  mount: (target: HTMLElement) => void;
  destroy: () => void;
  on: (event: 'change', listener: (event: { error?: { message?: string } }) => void) => void;
};

type StripeJs = {
  elements: () => { create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement };
  confirmCardPayment: (
    clientSecret: string,
    data: {
      payment_method: string | {
        card: StripeCardElement;
        billing_details: {
          name: string;
          email: string;
          phone?: string;
          address: { line1: string; line2?: string; city: string; postal_code: string; country: string };
        };
      };
      return_url: string;
    },
  ) => Promise<{ error?: { message?: string }; paymentIntent?: { id: string; status: string } }>;
  confirmCardSetup: (
    clientSecret: string,
    data: {
      payment_method: {
        card: StripeCardElement;
        billing_details: {
          name: string;
          email: string;
          phone?: string;
          address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };
        };
      };
    },
  ) => Promise<{ error?: { message?: string }; setupIntent?: { id: string; status: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeJs;
  }
}

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('glam-too-stripe-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Stripe card fields could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'glam-too-stripe-js';
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Stripe card fields could not be loaded.'));
    document.head.appendChild(script);
  });
}

function getCartItems(): CartItem[] {
  try {
    const stored = window.localStorage.getItem(cartStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<Partial<CartItem>>;
    return Array.isArray(parsed)
      ? parsed
        .filter((item) => item && typeof item.productId === 'number' && typeof item.size === 'string' && typeof item.quantity === 'number' && item.quantity > 0)
        .map((item) => ({
          productId: item.productId as number,
          size: item.size as string,
          colour: typeof item.colour === 'string' ? item.colour : undefined,
          variationId: typeof item.variationId === 'number' ? item.variationId : undefined,
          quantity: item.quantity as number,
        }))
      : [];
  } catch {
    return [];
  }
}

function clearCart() {
  window.localStorage.removeItem(cartStorageKey);
  window.dispatchEvent(new Event('glam-cart-updated'));
}

function getCartQueryItem(): CartItem | null {
  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get('product'));
  const size = params.get('size');
  const variationId = Number(params.get('variation'));
  const colour = params.get('colour');
  return Number.isInteger(productId) && productId > 0 && size
    ? {
        productId,
        size,
        colour: colour || undefined,
        variationId: Number.isInteger(variationId) && variationId > 0 ? variationId : undefined,
        quantity: 1,
      }
    : null;
}

function getCartCount() {
  const items = getCartItems();
  const queryItem = getCartQueryItem();
  const hasQueryItem = queryItem && items.some((item) =>
    item.productId === queryItem.productId
    && item.size === queryItem.size
    && item.colour === queryItem.colour
    && item.variationId === queryItem.variationId,
  );
  return items.reduce((total, item) => total + item.quantity, 0) + (queryItem && !hasQueryItem ? 1 : 0);
}

function parsePounds(value: string) {
  const amount = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPounds(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function addProductToCart(product: CatalogProduct, selection: Omit<CartItem, 'productId' | 'quantity'> = { size: 'One size' }) {
  const size = selection.size || 'One size';
  const items = getCartItems();
  const existingIndex = items.findIndex((item) =>
    item.productId === product.id
    && item.size === size
    && item.colour === selection.colour
    && item.variationId === selection.variationId,
  );
  const nextItems = [...items];
  if (existingIndex >= 0) {
    nextItems[existingIndex] = { ...nextItems[existingIndex], quantity: nextItems[existingIndex].quantity + 1 };
  } else {
    nextItems.push({
      productId: product.id,
      size,
      colour: selection.colour,
      variationId: selection.variationId,
      quantity: 1,
    });
  }
  try {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(nextItems));
    window.dispatchEvent(new Event('glam-cart-updated'));
    return true;
  } catch {
    return false;
  }
}

function getStorefrontProducts(): CatalogProduct[] {
  try {
    const stored = window.localStorage.getItem(adminProductsStorageKey);
    if (!stored) return catalogProducts;
    const products = JSON.parse(stored) as Array<Partial<CatalogProduct>>;
    if (!Array.isArray(products)) return catalogProducts;
    return products
      .filter((product) => String(product.status ?? '').toLowerCase() === 'published')
      .map((product, index) => {
        const matchingCatalogProduct = catalogProducts.find((candidate) =>
          candidate.id === Number(product.id) || candidate.name.toLowerCase() === String(product.name ?? '').toLowerCase(),
        );
        const matchingCategory = catalogCategories.find((category) =>
          slugify(category.name) === slugify(String(product.category ?? '')),
        );
        const productId = Number(product.id);
        return {
          ...matchingCatalogProduct,
          ...product,
          id: Number.isInteger(productId) && productId > 0 ? productId : matchingCatalogProduct?.id ?? index + 1,
          slug: createProductSlug(String(product.slug || product.name || matchingCatalogProduct?.slug || matchingCatalogProduct?.name || `product-${index + 1}`)),
          name: product.name || matchingCatalogProduct?.name || 'Glam Too piece',
          category: product.category || matchingCatalogProduct?.category || '',
          price: formatCatalogPrice(product.price || matchingCatalogProduct?.price || ''),
          image: product.image || matchingCatalogProduct?.image || matchingCategory?.image || fashionImage,
          position: product.position || matchingCatalogProduct?.position || '50% 50%',
          variations: (product.variations ?? matchingCatalogProduct?.variations ?? []).map((variation) => ({
            ...variation,
            price: formatCatalogPrice(variation.price),
          })),
        } as CatalogProduct;
      })
  } catch {
    return catalogProducts;
  }
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getStorefrontCategories(): CatalogCategory[] {
  try {
    const stored = window.localStorage.getItem(adminCategoriesStorageKey);
    if (!stored) return catalogCategories;
    const categories = JSON.parse(stored) as Array<Partial<CatalogCategory>>;
    if (!Array.isArray(categories)) return catalogCategories;
    return categories
      .filter((category) => typeof category?.name === 'string' && category.name.trim())
      .map((category, index) => ({
        id: typeof category.id === 'number' ? category.id : index + 1,
        name: category.name!.trim(),
        image: typeof category.image === 'string' ? category.image : '',
        description: typeof category.description === 'string' ? category.description : '',
      }));
  } catch {
    return catalogCategories;
  }
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(getCartCount);

  useEffect(() => {
    const updateCartCount = () => setCartCount(getCartCount());
    window.addEventListener('glam-cart-updated', updateCartCount);
    return () => window.removeEventListener('glam-cart-updated', updateCartCount);
  }, []);

  return (
    <header className="site-header" data-testid="site-header">
      <div className="header-inner">
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          data-testid="button-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        <a href="/shop" className="tool-label search-link" data-testid="link-search">
          <span className="tool-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.3 4.3" /></svg>
          </span>
          <span>Search</span>
        </a>
        <a href="/" data-testid="link-home-logo"><img className="logo" src={logoImage} alt="Glam Too" /></a>
        <div className="header-tools">
          <a href="/account" className="tool-label icon-link" aria-label="Account" data-testid="link-account">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="8" r="3.2" /><path d="M5.8 20c.6-3.3 2.7-5.1 6.2-5.1s5.6 1.8 6.2 5.1" /></svg>
            </span>
          </a>
          <a href="/cart" className="tool-label icon-link bag-link" aria-label={`Shopping bag, ${cartCount} item${cartCount === 1 ? '' : 's'}`} data-testid="link-cart">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><path d="M5.5 8.5h13l-1 11h-11z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" /></svg>
              {cartCount > 0 && <span className="bag-count">{cartCount}</span>}
            </span>
          </a>
        </div>
      </div>
      {menuOpen && <button className="nav-overlay" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <nav id="primary-navigation" className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Primary navigation">
        <div className="mobile-nav-head">
          <img src={logoImage} alt="Glam Too" />
          <button className="mobile-nav-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
        </div>
        <a href="/shop" data-testid="link-nav-new-in" onClick={() => setMenuOpen(false)}>New In</a>
        <a href="/category/dresses" data-testid="link-nav-dresses" onClick={() => setMenuOpen(false)}>Dresses</a>
        <a href="/shop" data-testid="link-nav-clothing" onClick={() => setMenuOpen(false)}>Clothing</a>
        <a href="/category/occasion" data-testid="link-nav-occasion" onClick={() => setMenuOpen(false)}>Occasion</a>
        <a href="/category/co-ords" data-testid="link-nav-co-ords" onClick={() => setMenuOpen(false)}>Co-Ords</a>
        <a href="/category/denim" data-testid="link-nav-denim" onClick={() => setMenuOpen(false)}>Denim</a>
        <a href="/category/accessories" data-testid="link-nav-accessories" onClick={() => setMenuOpen(false)}>Accessories</a>
        <a href="/shop" data-testid="link-nav-sale" onClick={() => setMenuOpen(false)}>Sale</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <>
      <section className="newsletter" aria-label="Newsletter signup">
        <div className="container newsletter-inner">
          <div className="newsletter-copy-group">
            <div className="newsletter-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <rect x="5" y="9" width="38" height="30" rx="1.5"></rect>
                <path d="m6 11 18 15L42 11"></path>
                <path d="m6 37 13-12M42 37 29 25"></path>
              </svg>
            </div>
            <div>
            <h2 className="display">Don&apos;t miss a thing</h2>
            <p>New drops, style inspo and exclusive perks straight to your inbox.</p>
            </div>
          </div>
          <form className="newsletter-form" action="/" method="get">
            <label className="sr-only" htmlFor="newsletter-email">Email address</label>
            <input id="newsletter-email" name="email" type="email" placeholder="Enter your email address" required data-testid="input-newsletter-email" />
            <button type="submit" data-testid="button-newsletter-submit">Sign me up</button>
          </form>
        </div>
      </section>
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <img className="footer-logo" src={logoImage} alt="Glam Too" />
              <p className="footer-intro">Outfits that make every moment yours. Expressive pieces for the beautifully busy life.</p>
              <div className="footer-socials" aria-label="Social links">
                <a href="/" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"></rect><circle cx="12" cy="12" r="3.5"></circle><circle cx="17.3" cy="6.8" r=".8" fill="currentColor" stroke="none"></circle></svg>
                </a>
                <a href="/" aria-label="Facebook">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 20v-7h2.4l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5H17V4.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2H8.5v3h2.4v7"></path></svg>
                </a>
                <a href="/" aria-label="TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.2a3.7 3.7 0 1 1-3-3.6"></path><path d="M14 4c.5 2.5 2 4 4.5 4.3"></path></svg>
                </a>
                <a href="/" aria-label="Pinterest">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 20c1-2 1.2-3.2 1.7-5.2.4.8 1.4 1.6 2.8 1.6 3.7 0 6-3.1 6-6.8C20 6.2 16.8 4 12.4 4 7 4 4 7.4 4 11c0 2.1.8 4 2.5 4.7.2.1.4 0 .5-.2l.4-1.5c.1-.2 0-.3-.1-.5-.5-.6-.8-1.4-.8-2.5 0-3.3 2.5-6.2 6.5-6.2 3.5 0 5.4 2.1 5.4 4.9 0 3.7-1.6 6.8-4 6.8-1.3 0-2.3-1-2-2.3.4-1.7 1.1-3.5 1.1-4.7 0-1.1-.6-2-1.8-2-1.4 0-2.5 1.4-2.5 3.3 0 1.2.4 2 .4 2l-1.6 6.8"></path></svg>
                </a>
              </div>
            </div>
            <div><h4>Shop</h4><ul><li><a href="/shop" data-testid="link-footer-new-in">New In</a></li><li><a href="/category/dresses" data-testid="link-footer-dresses">Dresses</a></li><li><a href="/shop" data-testid="link-footer-clothing">Clothing</a></li><li><a href="/category/occasion" data-testid="link-footer-occasion">Occasion</a></li><li><a href="/category/co-ords" data-testid="link-footer-co-ords">Co-Ords</a></li><li><a href="/category/denim" data-testid="link-footer-denim">Denim</a></li><li><a href="/category/accessories" data-testid="link-footer-accessories">Accessories</a></li><li><a href="/shop" data-testid="link-footer-sale">Sale</a></li></ul></div>
            <div><h4>Help</h4><ul><li><a href="/delivery-returns" data-testid="link-footer-delivery">Delivery &amp; Returns</a></li><li><a href="/faq" data-testid="link-footer-size-guide">Size Guide</a></li><li><a href="/faq" data-testid="link-footer-faq">FAQ</a></li><li><a href="/contact" data-testid="link-footer-contact">Contact Us</a></li></ul></div>
            <div><h4>About</h4><ul><li><a href="/about" data-testid="link-footer-about">About</a></li><li><a href="/about" data-testid="link-footer-style-journal">Style Journal</a></li></ul></div>
            <div className="footer-knowledge"><h4>Stay in the know</h4><p>Sign up for new arrivals<br />and exclusive offers.</p><form className="footer-newsletter-form" action="/" method="get"><label className="sr-only" htmlFor="footer-newsletter-email">Email address</label><input id="footer-newsletter-email" name="email" type="email" placeholder="Enter your email" required data-testid="input-footer-newsletter-email" /><button type="submit" aria-label="Sign me up" data-testid="button-footer-newsletter-submit">→</button></form></div>
          </div>
          <div className="footer-bottom"><span>© 2026 Glam Too. All rights reserved.</span><div className="footer-legal-links"><a href="/privacy" data-testid="link-footer-privacy">Privacy Policy</a><span aria-hidden="true">|</span><a href="/terms" data-testid="link-footer-terms">Terms &amp; Conditions</a></div></div>
        </div>
      </footer>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <><Header /><main className="page">{children}</main><Footer /></>;
}

function ProductCard({ product, featured = false, showShopNow = false }: { product: CatalogProduct; featured?: boolean; showShopNow?: boolean }) {
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      <a href={`/product/${product.slug}`} data-testid={`link-product-${product.id}`}>
        <div className="product-image">
          {featured && <span className="badge">Just in</span>}
          <span className="heart" aria-hidden="true">♡</span>
          <img src={product.image} alt={product.name} />
        </div>
        <div className="product-info">
          <div><div className="product-name">{product.name}</div><div className="product-meta">{product.category}</div></div>
          <div className="price">{product.price}</div>
            {showShopNow && <span className="product-shop-now">Shop now</span>}
        </div>
      </a>
    </article>
  );
}

function Home() {
  const [products] = useState<CatalogProduct[]>(getStorefrontProducts);
  const categories = getStorefrontCategories();
  const categoryImage = (name: string, fallback: string) =>
    categories.find((category) => slugify(category.name) === slugify(name))?.image || fallback;
  const collectionImages = {
    dresses: categoryImage("Dresses", catalogCategories[0].image),
    coords: categoryImage("Co-Ords", catalogCategories[2].image),
    occasion: categoryImage("Occasion", catalogCategories[1].image),
    denim: categoryImage("Denim", catalogCategories[3].image),
    accessories: categoryImage("Accessories", catalogCategories[4].image),
  };
  const momentPlans = [
    { name: "Day Out", copy: "Bright looks for sunny plans." },
    { name: "Date Night", copy: "Turn heads from six to midnight." },
    { name: "Weddings", copy: "Guest-ready looks for the loved-up days." },
    { name: "Weekend Plans", copy: "Effortless pieces for off-duty hours." },
  ];
  return (
    <Shell>
      <section className="hero" aria-label="The new occasion edit">
        <img className="hero-image" src={heroImage} alt="Woman in a pink dress beside a vintage pink car on a sunny street" />
        <div className="hero-copy">
          <h1>It&apos;s your moment</h1>
          <p>Standout outfits for every plan on your calendar.</p>
          <a className="button button-pink" href="/shop" data-testid="link-hero-shop">Shop New In</a>
        </div>
      </section>
      <section className="collection-collage container" aria-labelledby="collection-heading">
        <h2 id="collection-heading" className="sr-only">Shop the collection</h2>
        <div className="collection-tile collection-dresses">
          <img src={collectionImages.dresses} alt="Dresses collection" />
          <div><h3>Dresses</h3><p>From day dates<br />to after dark.</p><a href="/category/dresses">Shop dresses <span>→</span></a></div>
        </div>
        <div className="collection-tile collection-coords">
          <img src={collectionImages.coords} alt="Co-Ords collection" />
          <div><h3>Co-Ords</h3><p>Effortless<br />matching sets<br />made to wear.</p><a href="/category/co-ords">Shop co-ords <span>→</span></a></div>
        </div>
        <div className="collection-tile collection-occasion">
          <img src={collectionImages.occasion} alt="Occasion collection" />
          <div><h3>Occasion</h3><p>For weddings,<br />parties &amp; all the<br />special plans.</p><a href="/category/occasion">Shop occasion <span>→</span></a></div>
        </div>
        <div className="collection-tile collection-denim">
          <img src={collectionImages.denim} alt="Denim collection" />
          <div><h3>Denim</h3><p>Everyday staples<br />with a fresh<br />season twist.</p><a href="/category/denim">Shop denim <span>→</span></a></div>
        </div>
        <div className="collection-tile collection-accessories">
          <img src={collectionImages.accessories} alt="Accessories collection" />
          <div><h3>Accessories</h3><p>The finishing<br />touch.</p><a href="/category/accessories">Shop accessories <span>→</span></a></div>
        </div>
      </section>
      <section className="products-section container home-obsessions" aria-labelledby="obsessions-heading">
        <div className="home-obsessions-heading">
          <div className="eyebrow">The Glam Edit</div>
          <h2 id="obsessions-heading">Our Current Obsessions</h2>
        </div>
        <div className="product-grid">{products.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} showShopNow />)}</div>
      </section>
      <section className="moments" aria-labelledby="moments-heading">
        <div className="container">
          <div className="moments-heading"><div className="eyebrow">Shop by moment</div><h2 id="moments-heading">Outfits for Every Plan</h2></div>
          <div className="moment-grid">
            {momentPlans.map((moment, index) => {
              const product = products[index + 3] ?? products[index] ?? products[0];
              if (!product) return null;
              return <a className="moment-card" href={`/product/${product.slug}`} key={moment.name} data-testid={`link-moment-${index}`}>
                <img src={product.image} alt={`${product.name}, ${moment.name} fashion edit`} style={{ objectPosition: product.position }} />
                <div className="moment-copy"><h3>{moment.name}</h3><p>{moment.copy}</p><span className="moment-shop-link">Shop now <span aria-hidden="true">→</span></span></div>
              </a>;
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function PageHero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <section className="page-hero"><div className="container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{copy && <p>{copy}</p>}</div></section>;
}

function Shop() {
  const products = getStorefrontProducts();
  return <Shell><PageHero eyebrow="The shop" title="Pieces with presence." copy="A considered wardrobe of colour, texture and easy confidence. Find something for the plan you have, and the one you haven't made yet." /><div className="container shop-layout"><aside className="filter"><h3>Browse</h3><a href="/shop">All pieces</a><a href="/category">Dresses</a><a href="/category">Occasionwear</a><a href="/shop">Tops &amp; tailoring</a><a href="/shop">Accessories</a><h3 style={{ marginTop: 36 }}>Sort by</h3><a href="/shop">New in</a><a href="/shop">Bestsellers</a><a href="/shop">Price: low to high</a></aside><section className="shop-main"><div className="shop-toolbar"><span>{products.length} pieces</span><span>Showing all</span></div><div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} featured={index < 2} />)}</div></section></div></Shell>;
}

function CategoryCard({ category }: { category: CatalogCategory }) {
  const categorySlug = slugify(category.name);
  return (
    <a className="category-directory-card" href={`/category/${categorySlug}`} data-testid={`link-category-${categorySlug}`}>
      <div className="category-directory-image">
        {category.image ? <img src={category.image} alt={`${category.name} collection`} /> : <span>No image yet</span>}
      </div>
      <div className="category-directory-copy">
        <div>
          <div className="eyebrow">Collection</div>
          <h2>{category.name}</h2>
          <p>{category.description || "Explore the latest pieces from this collection."}</p>
        </div>
        <span className="category-directory-link">Explore collection <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );
}

function CategoryIndex() {
  const categories = getStorefrontCategories();
  return (
    <Shell>
      <PageHero eyebrow="The collections" title="Find your moment." copy="Explore every Glam Too collection, from effortless everyday layers to the pieces made for an entrance." />
      <section className="container category-directory" aria-labelledby="category-directory-heading">
        <div className="section-heading">
          <div><div className="eyebrow">Every collection</div><h2 id="category-directory-heading">Shop by category</h2></div>
          <span className="category-count">{categories.length} collections</span>
        </div>
        <div className="category-directory-grid">
          {categories.map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
    </Shell>
  );
}

function CategoryDetail({ params }: { params: { slug: string } }) {
  const categories = getStorefrontCategories();
  const category = categories.find((item) => slugify(item.name) === params.slug);
  if (!category) return <NotFound />;
  const products = getStorefrontProducts().filter((product) => slugify(product.category) === params.slug);

  return (
    <Shell>
      <section className="category-banner" aria-labelledby="category-banner-heading">
        <div className="container category-banner-inner">
          <div className="category-banner-media">
            {category.image ? <img src={category.image} alt={`${category.name} collection campaign`} /> : <div className="category-banner-empty">Glam Too collection</div>}
          </div>
          <div className="category-banner-copy">
            <div className="eyebrow">The {category.name.toLowerCase()} edit</div>
            <h1 id="category-banner-heading">{category.name}</h1>
            <p>{category.description || `Pieces selected for every ${category.name.toLowerCase()} moment.`}</p>
            <a className="button button-pink" href="#category-products">Shop the edit</a>
          </div>
        </div>
      </section>
      <section className="container category-products" id="category-products" aria-labelledby="category-products-heading">
        <div className="section-heading">
          <div><div className="eyebrow">The edit</div><h2 id="category-products-heading">{category.name} pieces</h2></div>
          <span className="category-count">{products.length} {products.length === 1 ? "piece" : "pieces"}</span>
        </div>
        {products.length > 0 ? (
          <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        ) : (
          <div className="category-empty"><h3>More pieces are on their way.</h3><p>Explore the full shop while we add to this collection.</p><a className="button" href="/shop">View all pieces</a></div>
        )}
      </section>
    </Shell>
  );
}

function Product() {
  return <Shell><div className="container product-detail"><div className="product-detail-layout"><div className="product-gallery"><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress in blush pink, full editorial view" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress detail" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress styled for occasionwear" /></div></div><div className="detail-copy"><div className="eyebrow">The occasion edit · Just in</div><h1>Luna Ruffle Mini Dress</h1><div className="detail-price">£89.99</div><p>A little romance, a lot of movement. Luna is cut in soft recycled satin with a gathered neckline, floaty ruffles and a hem made for dancing.</p><form className="detail-form" action="/cart" method="get"><div className="field"><label htmlFor="dress-size">Select size</label><select id="dress-size" name="size" defaultValue="" required data-testid="select-product-size"><option value="" disabled>Choose a size</option><option>UK 6</option><option>UK 8</option><option>UK 10</option><option>UK 12</option><option>UK 14</option></select></div><div className="field"><label>Colour · Blush</label><div className="swatches" aria-label="Available colours"><span className="swatch swatch-pink" title="Blush"></span><span className="swatch swatch-black" title="Black"></span><span className="swatch swatch-blue" title="Sky"></span></div></div><button className="button" type="submit" data-testid="button-add-to-bag">Add to bag · £89.99</button></form><div className="detail-notes"><details open><summary>Fit &amp; details</summary><p>True to size with a relaxed, floaty fit. Adjustable straps and invisible side zip. Dress length: 82cm.</p></details><details><summary>Delivery &amp; returns</summary><p>Free standard delivery over £75. Return unworn pieces within 28 days.</p></details></div></div></div></div></Shell>;
}

function ProductDetail({ params }: { params: { slug: string } }) {
  const product = getStorefrontProducts().find((item) => item.slug === params.slug || String(item.id) === params.slug);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColour, setSelectedColour] = useState('');
  const [variationMessage, setVariationMessage] = useState('');
  const productVariations = product?.type === 'Variable'
    ? product.variations
    : [];
  const availableVariations = productVariations.filter((variation) => variation.stock > 0);
  const sizes = [...new Set(productVariations.map((variation) => variation.size).filter(Boolean))];
  const colours = [...new Set(productVariations.map((variation) => variation.colour).filter(Boolean))];
  const hasCompatibleVariation = (size?: string, colour?: string) =>
    availableVariations.some((variation) =>
      (!size || variation.size === size) && (!colour || variation.colour === colour),
    );
  const hasAllRequiredSelections =
    (sizes.length === 0 || Boolean(selectedSize))
    && (colours.length === 0 || Boolean(selectedColour));
  const selectedVariation = product?.type === 'Variable'
    ? (sizes.length > 0 && !selectedSize) || (colours.length > 0 && !selectedColour)
      ? undefined
      : availableVariations.find((variation) =>
      (!sizes.length || variation.size === selectedSize)
      && (!colours.length || variation.colour === selectedColour),
    )
    : undefined;
  const displayedPrice = selectedVariation?.price ?? product?.price ?? '';

  if (!product) return <NotFound />;
  const selectedProduct = product;

  function handleAddToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedProduct.type === 'Variable' && !selectedVariation) {
      setVariationMessage('Choose an available option before adding this product to your bag.');
      return;
    }
    const selection = selectedVariation
      ? { size: selectedVariation.size || 'One size', colour: selectedVariation.colour || undefined, variationId: selectedVariation.id }
      : { size: 'One size' };
    const wasSaved = addProductToCart(selectedProduct, selection);
    const fallbackParams = new URLSearchParams({
      product: String(selectedProduct.id),
      size: selection.size,
    });
    if (selection.colour) fallbackParams.set('colour', selection.colour);
    if (selection.variationId) fallbackParams.set('variation', String(selection.variationId));
    window.location.href = wasSaved ? '/cart' : `/cart?${fallbackParams.toString()}`;
  }

  return (
    <Shell>
      <div className="container product-detail">
        <div className="product-detail-layout">
          <div className="product-gallery">
            <div className="gallery-image"><img src={product.image} alt={product.name} style={{ objectPosition: product.position }} /></div>
          </div>
          <div className="detail-copy">
            <div className="eyebrow">{product.category} edit · Glam Too</div>
            <h1>{product.name}</h1>
              <div className="detail-price">{displayedPrice}</div>
            <p>{product.description}</p>
            <form className="detail-form" onSubmit={handleAddToCart}>
              <input type="hidden" name="product" value={product.id} />
               {product.type === 'Variable' && (
                 <>
                   {sizes.length > 0 && <div className="field"><label htmlFor={`product-size-${product.id}`}>Select size</label><select id={`product-size-${product.id}`} name="size" value={selectedSize} onChange={(event) => { const nextSize = event.target.value; setSelectedSize(nextSize); if (selectedColour && !hasCompatibleVariation(nextSize, selectedColour)) setSelectedColour(''); setVariationMessage(''); }} required data-testid={`select-product-size-${product.id}`}><option value="" disabled>Choose a size</option>{sizes.map((size) => <option key={size} disabled={!hasAllRequiredSelections && !hasCompatibleVariation(size, selectedColour || undefined)}>{size}</option>)}</select></div>}
                   {colours.length > 0 && <div className="field"><label htmlFor={`product-colour-${product.id}`}>Select colour</label><select id={`product-colour-${product.id}`} name="colour" value={selectedColour} onChange={(event) => { const nextColour = event.target.value; setSelectedColour(nextColour); if (selectedSize && !hasCompatibleVariation(selectedSize, nextColour)) setSelectedSize(''); setVariationMessage(''); }} required data-testid={`select-product-colour-${product.id}`}><option value="" disabled>Choose a colour</option>{colours.map((colour) => <option key={colour} disabled={!hasAllRequiredSelections && !hasCompatibleVariation(selectedSize || undefined, colour)}>{colour}</option>)}</select></div>}
                   {availableVariations.length === 0 && <p className="variation-message">This product is currently unavailable.</p>}
                   {variationMessage && <p className="variation-message" role="alert">{variationMessage}</p>}
                 </>
               )}
               <button className="button" type="submit" disabled={product.type === 'Variable' && !selectedVariation} data-testid={`button-add-to-bag-${product.id}`}>Add to bag · {displayedPrice}</button>
            </form>
            <div className="detail-notes"><details open><summary>Fit &amp; details</summary><p>True to size with an easy, considered fit.</p></details><details><summary>Delivery &amp; returns</summary><p>Free standard delivery over £75. Return unworn pieces within 28 days.</p></details></div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function About() {
  return <Shell><div className="split-page"><div className="split-image"><img src={fashionImage} alt="Glam Too woman wearing pink in the sunshine" /></div><div className="split-copy"><div className="eyebrow">Our story</div><h1>More you, more often.</h1><p>Glam Too began with a simple belief: getting dressed should be one of the best parts of your day. We make expressive, feminine clothes for the many versions of you — the early riser, the plus-one, the main character and the one who stays out for one more.</p><p>Our collections are small, considered and designed to be worn on repeat. Expect confident colour, thoughtful details and pieces that make an ordinary Tuesday feel like a very good idea.</p><div className="quote">“Wear the thing that makes you stand a little taller.”</div></div></div></Shell>;
}

function FAQ() {
  const questions = [['How do Glam Too pieces fit?', 'Most pieces fit true to size. Every product page includes fit notes and garment measurements to help you choose. If you are between sizes, we recommend sizing up in fitted styles.'], ['When will my order arrive?', 'Standard delivery takes 2–4 working days and express delivery takes 1–2 working days. You will receive tracking as soon as your parcel leaves us.'], ['Can I return something?', 'Of course. Send unworn, unwashed items back within 28 days of delivery with tags attached. Visit Delivery & Returns for the full guide.'], ['Do you deliver internationally?', 'We currently deliver across the UK and selected European destinations. Delivery options and costs are shown at checkout.'], ['How can I contact you?', 'Our team is here Monday to Friday, 9am–5pm. Email hello@glamtoo.co.uk or use our contact form.']];
  return <Shell><PageHero eyebrow="Need to know" title="Questions, answered." copy="The useful details, without the fine-print maze." /><div className="container faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary data-testid={`text-faq-question-${index}`}>{question}</summary><p>{answer}</p></details>)}</div></Shell>;
}

function Contact() {
  return <Shell><div className="container form-page"><div className="form-layout"><div className="form-copy"><div className="eyebrow">Say hello</div><h1>Let&apos;s talk.</h1><p>Questions about a fit, an order or your next big moment? Our small, lovely customer care team is ready.</p><p>hello@glamtoo.co.uk<br />Monday–Friday, 9am–5pm</p></div><form className="form-stack" action="/contact" method="get"><div className="field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" type="text" required data-testid="input-contact-name" /></div><div className="field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" required data-testid="input-contact-email" /></div><div className="field"><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic" name="topic" defaultValue="" data-testid="select-contact-topic"><option value="" disabled>Choose a topic</option><option>Order help</option><option>Fit &amp; styling</option><option>Returns</option><option>Something else</option></select></div><div className="field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required data-testid="textarea-contact-message"></textarea></div><button className="button" type="submit" data-testid="button-contact-submit">Send message</button></form></div></div></Shell>;
}

function LegalPage({ type }: { type: 'privacy' | 'terms' | 'delivery' }) {
  const copy = type === 'privacy' ? { eyebrow: 'The small print', title: 'Privacy policy', heads: ['The short version', 'What we collect', 'How we use your information'], paras: ['We respect your information and only collect what we need to make your Glam Too experience work well. This policy explains what happens to your details when you browse or shop with us.', 'When you place an order, sign up to our notes or contact us, we may collect your name, contact details, delivery address and order information. We never sell your personal information.', 'We use information to process orders, answer your questions, improve our website and send emails you have chosen to receive. You can unsubscribe at any time.'] } : type === 'terms' ? { eyebrow: 'The small print', title: 'Terms & conditions', heads: ['Using this site', 'Products and pricing', 'Orders'], paras: ['By using glamtoo.co.uk, you agree to use the site lawfully and with respect for our content, team and community. These terms apply to every visit and purchase.', 'We take care to keep product descriptions, colours and prices accurate. Occasionally a detail may change; if it affects your order, we will contact you before dispatch.', 'An order is confirmed when you receive our email confirmation. If we cannot fulfil an item, we will let you know and refund the unavailable part of your order.'] } : { eyebrow: 'The useful details', title: 'Delivery & returns', heads: ['Delivery', 'Returns', 'The good-to-know bit'], paras: ['Standard delivery is £3.95 and takes 2–4 working days. Express delivery is £6.95 and takes 1–2 working days. Standard delivery is free on orders over £75.', 'Changed your mind? Return unworn items with tags attached within 28 days of delivery. Start your return by emailing hello@glamtoo.co.uk with your order number.', 'Please try on occasionwear over underwear and keep makeup, perfume and deodorant away from garments. Items showing signs of wear may not be accepted.'] };
  return <Shell><div className="container legal"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1>{copy.heads.map((head, index) => <section key={head}><h2>{head}</h2><p>{copy.paras[index]}</p></section>)}<p>Last updated: February 2026. For any questions, please <a className="text-link" href="/contact">contact our team</a>.</p></div></Shell>;
}

function Cart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    const storedItems = getCartItems();
    const queryItem = getCartQueryItem();
    return queryItem && !storedItems.some((item) =>
      item.productId === queryItem.productId
      && item.size === queryItem.size
      && item.colour === queryItem.colour
      && item.variationId === queryItem.variationId,
    )
      ? [...storedItems, queryItem]
      : storedItems;
  });
  const products = getStorefrontProducts();
  const cartLines = items.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variation = product?.type === 'Variable'
      ? product.variations.find((candidate) => candidate.id === item.variationId)
      : undefined;
    return product ? [{ item, product, variation }] : [];
  });
  const subtotal = cartLines.reduce((total, { item, product, variation }) => total + parsePounds(variation?.price ?? product.price) * item.quantity, 0);

  function removeCartItem(itemToRemove: CartItem) {
    const nextItems = items.filter((item) =>
      item.productId !== itemToRemove.productId
      || item.size !== itemToRemove.size
      || item.colour !== itemToRemove.colour
      || item.variationId !== itemToRemove.variationId,
    );
    setItems(nextItems);
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(nextItems));
    } catch {
      // The visible cart still updates if browser storage is unavailable.
    }
    const queryItem = getCartQueryItem();
    if (
      queryItem?.productId === itemToRemove.productId
      && queryItem.size === itemToRemove.size
      && queryItem.colour === itemToRemove.colour
      && queryItem.variationId === itemToRemove.variationId
    ) {
      window.history.replaceState({}, '', '/cart');
    }
    window.dispatchEvent(new Event('glam-cart-updated'));
  }

  return (
    <Shell>
      <div className="container cart-page">
        <div className="eyebrow">Your edit</div>
        <h1>Your bag.</h1>
        {cartLines.length === 0 ? (
          <p>Your bag is empty. <a className="text-link" href="/shop">Continue shopping</a></p>
        ) : (
          <div className="cart-layout">
            <div>
              {cartLines.map(({ item, product, variation }) => (
                <div className="cart-item" key={`${item.productId}-${item.variationId ?? item.size}-${item.colour ?? ''}`}>
                  <img src={product.image} alt={product.name} style={{ objectPosition: product.position }} />
                  <div>
                    <h3>{product.name}</h3>
                    <p>{[item.size !== 'One size' ? item.size : '', item.colour ?? ''].filter(Boolean).join(' · ')}{item.size !== 'One size' || item.colour ? ' · ' : ''}Qty {item.quantity}</p>
                    <a className="text-link" href={`/product/${product.slug}`}>Edit item</a>
                  </div>
                  <strong>{formatPounds(parsePounds(variation?.price ?? product.price) * item.quantity)}</strong>
                  <button className="cart-remove" type="button" aria-label={`Remove ${product.name}`} data-testid={`button-remove-cart-${item.productId}-${item.variationId ?? item.size.replace(/\s+/g, '-').toLowerCase()}`} onClick={() => removeCartItem(item)}>×</button>
                </div>
              ))}
              <a className="text-link" href="/shop" data-testid="link-cart-continue">Continue shopping</a>
            </div>
            <aside className="cart-summary">
              <h2>Summary</h2>
              <div className="summary-row"><span>Subtotal</span><span>{formatPounds(subtotal)}</span></div>
              <div className="summary-row"><span>Delivery</span><span>Free</span></div>
              <div className="summary-row total"><span>Total</span><span>{formatPounds(subtotal)}</span></div>
              <a className="button button-pink" href="/checkout" data-testid="link-checkout">Go to checkout</a>
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Checkout() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [cardError, setCardError] = useState("");
  const [delivery, setDelivery] = useState<"standard" | "express">("standard");
  const [publishableKey, setPublishableKey] = useState("");
  const [paymentSetupError, setPaymentSetupError] = useState("");
  const [checkoutProfile, setCheckoutProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripePaymentRef = useRef<{ stripe: StripeJs; card: StripeCardElement } | null>(null);
  const products = getStorefrontProducts();
  const storedItems = getCartItems();
  const queryItem = getCartQueryItem();
  const checkoutItems = queryItem && !storedItems.some((item) =>
    item.productId === queryItem.productId
    && item.size === queryItem.size
    && item.colour === queryItem.colour
    && item.variationId === queryItem.variationId,
  ) ? [...storedItems, queryItem] : storedItems;
  const cartLines = checkoutItems.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variation = product?.type === "Variable"
      ? product.variations.find((candidate) => candidate.id === item.variationId)
      : undefined;
    return product ? [{ item, product, variation }] : [];
  });
  const subtotal = cartLines.reduce((total, { item, product, variation }) => total + parsePounds(variation?.price ?? product.price) * item.quantity, 0);

  useEffect(() => {
    if (cartLines.length === 0) setLocation(`${basePath}/cart`);
  }, [cartLines.length, setLocation]);

  useEffect(() => {
    let cancelled = false;
    setPaymentSetupError("");
    fetch("/api/stripe/payment-config", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !payload.publishableKey) throw new Error(payload.error || "Stripe card payments are unavailable.");
        if (!cancelled) setPublishableKey(payload.publishableKey);
      })
      .catch((error) => {
        if (!cancelled) setPaymentSetupError(error instanceof Error ? error.message : "Stripe card payments are unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/account/profile", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { profile?: CustomerProfile };
        return response.ok ? result.profile : undefined;
      }),
      fetch("/api/stripe/payment-methods", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { paymentMethods?: SavedPaymentMethod[] };
        return response.ok && Array.isArray(result.paymentMethods) ? result.paymentMethods : [];
      }),
    ])
      .then(([profile, paymentMethods]) => {
        if (cancelled) return;
        if (profile) setCheckoutProfile(profile);
        setSavedPaymentMethods(paymentMethods);
        if (paymentMethods[0]) setSelectedPaymentMethodId(paymentMethods[0].id);
      })
      .catch(() => {
        // Checkout stays available with blank fields if saved details cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!publishableKey || selectedPaymentMethodId || !cardMountRef.current) return;
    let cancelled = false;
    let card: StripeCardElement | null = null;
    void loadStripeJs()
      .then(() => {
        const stripe = window.Stripe?.(publishableKey);
        if (!stripe || !cardMountRef.current) throw new Error("Stripe card fields could not be initialized.");
        card = stripe.elements().create("card", {
          disableLink: true,
          hidePostalCode: true,
          style: {
            base: {
              color: "#171615",
              fontFamily: "DM Sans, sans-serif",
              fontSize: "16px",
              "::placeholder": { color: "#827975" },
            },
            invalid: { color: "#b42342" },
          },
        });
        if (cancelled) {
          card.destroy();
          return;
        }
        card.mount(cardMountRef.current);
        card.on("change", (event) => setCardError(event.error?.message ?? ""));
        stripePaymentRef.current = { stripe, card };
      })
      .catch((error) => {
        if (!cancelled) setPaymentSetupError(error instanceof Error ? error.message : "Stripe card fields are unavailable.");
      });
    return () => {
      cancelled = true;
      stripePaymentRef.current = null;
      card?.destroy();
    };
  }, [publishableKey, selectedPaymentMethodId]);

  async function beginStripeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSignedIn) {
      setPaymentError("Sign in before checkout so this order is saved to your account.");
      return;
    }
    if (cartLines.length === 0) {
      setPaymentError("Your bag is empty. Add a piece before checking out.");
      return;
    }

    if (!selectedPaymentMethodId && !stripePaymentRef.current) {
      setPaymentError(paymentSetupError || "Stripe card fields are still loading. Please wait a moment and try again.");
      return;
    }

    setIsPaying(true);
    setPaymentError("");
    const formData = new FormData(event.currentTarget);
    const lines = cartLines.map(({ item, product, variation }) => ({
      productId: String(product.id),
      variationId: variation ? String(variation.id) : undefined,
      quantity: item.quantity,
    }));

    try {
      const customerName = [formData.get("firstName"), formData.get("lastName")].filter(Boolean).join(" ");
      const response = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          customerName,
          phone: formData.get("phone"),
          lines,
          delivery,
          paymentMethodId: selectedPaymentMethodId || undefined,
          address: {
            line1: formData.get("address"),
            line2: formData.get("addressTwo"),
            city: formData.get("city"),
            postcode: formData.get("postcode"),
            country: formData.get("country"),
          },
        }),
      });
      const result = await response.json() as { clientSecret?: string; error?: string };
      if (!response.ok || !result.clientSecret) throw new Error(result.error || "Stripe checkout is not available right now.");

      const billingDetails = {
        name: customerName,
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? "") || undefined,
        address: {
          line1: String(formData.get("address") ?? ""),
          line2: String(formData.get("addressTwo") ?? "") || undefined,
          city: String(formData.get("city") ?? ""),
          postal_code: String(formData.get("postcode") ?? ""),
          country: String(formData.get("country") ?? "GB"),
        },
      };
      const stripe = stripePaymentRef.current?.stripe;
      if (!stripe) throw new Error("Stripe card fields are still loading. Please wait a moment and try again.");
      const confirmation = await stripe.confirmCardPayment(result.clientSecret, {
        payment_method: selectedPaymentMethodId || {
          card: stripePaymentRef.current?.card as StripeCardElement,
          billing_details: billingDetails,
        },
        return_url: `${window.location.origin}${basePath}/order-confirmation`,
      });
      if (confirmation.error) throw new Error(confirmation.error.message || "Your card could not be confirmed.");
      if (confirmation.paymentIntent?.status !== "succeeded") throw new Error("Your payment needs additional confirmation. Please try again.");
      clearCart();
      window.location.assign(`${basePath}/order-confirmation?payment_intent=${encodeURIComponent(confirmation.paymentIntent.id)}`);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to start Stripe checkout.");
      setIsPaying(false);
    }
  }

  const deliveryAmount = delivery === "express" ? 6.95 : 0;
  const total = subtotal + deliveryAmount;
  const updateCheckoutProfile = (field: keyof CustomerProfile, value: string) => {
    setCheckoutProfile((current) => ({ ...current, [field]: value }));
  };

  if (cartLines.length === 0) return null;

  return (
    <Shell>
      <main className="container checkout-page">
        <header className="checkout-heading">
          <div>
            <div className="eyebrow">Nearly yours</div>
            <h1>Checkout.</h1>
            <p>Enter your details, review your order, then pay securely with Stripe.</p>
          </div>
          <a className="text-link" href="/cart">Return to bag</a>
        </header>
        <form className="checkout-layout" onSubmit={beginStripeCheckout}>
          <div className="checkout-details">
            {!isSignedIn && <div className="checkout-account-notice"><strong>Sign in to save this order to your account.</strong><a className="text-link" href="/account">Sign in or create an account</a></div>}
            <section className="checkout-section">
              <div className="checkout-section-heading"><span>01</span><div><h2>Billing details</h2><p>We&apos;ll use these details for your payment confirmation.</p></div></div>
              <div className="checkout-field-grid">
                <div className="field"><label htmlFor="checkout-first-name">First name</label><input id="checkout-first-name" name="firstName" type="text" required data-testid="input-checkout-first-name" value={checkoutProfile.firstName} onChange={(event) => updateCheckoutProfile("firstName", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-last-name">Last name</label><input id="checkout-last-name" name="lastName" type="text" required data-testid="input-checkout-last-name" value={checkoutProfile.lastName} onChange={(event) => updateCheckoutProfile("lastName", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-email">Email address</label><input id="checkout-email" name="email" type="email" required autoComplete="email" data-testid="input-checkout-email" value={checkoutProfile.email} onChange={(event) => updateCheckoutProfile("email", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-country">Country / region</label><select id="checkout-country" name="country" value={checkoutProfile.country} onChange={(event) => updateCheckoutProfile("country", event.target.value)}><option value="GB">United Kingdom</option></select></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-address">Street address</label><input id="checkout-address" name="address" type="text" required autoComplete="address-line1" placeholder="House number and street name" data-testid="input-checkout-address" value={checkoutProfile.addressLine1} onChange={(event) => updateCheckoutProfile("addressLine1", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-address-two">Address line 2 <span>Optional</span></label><input id="checkout-address-two" name="addressTwo" type="text" autoComplete="address-line2" placeholder="Apartment, suite, unit, etc." value={checkoutProfile.addressLine2} onChange={(event) => updateCheckoutProfile("addressLine2", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-city">Town or city</label><input id="checkout-city" name="city" type="text" required autoComplete="address-level2" data-testid="input-checkout-city" value={checkoutProfile.city} onChange={(event) => updateCheckoutProfile("city", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-postcode">Postcode</label><input id="checkout-postcode" name="postcode" type="text" required autoComplete="postal-code" data-testid="input-checkout-postcode" value={checkoutProfile.postcode} onChange={(event) => updateCheckoutProfile("postcode", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-phone">Phone <span>Optional</span></label><input id="checkout-phone" name="phone" type="tel" autoComplete="tel" placeholder="For delivery updates only" value={checkoutProfile.phone} onChange={(event) => updateCheckoutProfile("phone", event.target.value)} /></div>
              </div>
            </section>
            <section className="checkout-section">
              <div className="checkout-section-heading"><span>02</span><div><h2>Shipping</h2><p>Choose how quickly you&apos;d like your order to arrive.</p></div></div>
              <div className="checkout-delivery-options">
                <label className={`checkout-delivery-option ${delivery === "standard" ? "is-selected" : ""}`}><input type="radio" name="delivery" value="standard" checked={delivery === "standard"} onChange={() => setDelivery("standard")} /><span><strong>Standard delivery</strong><small>3–5 working days</small></span><b>Free</b></label>
                <label className={`checkout-delivery-option ${delivery === "express" ? "is-selected" : ""}`}><input type="radio" name="delivery" value="express" checked={delivery === "express"} onChange={() => setDelivery("express")} /><span><strong>Express delivery</strong><small>1–2 working days</small></span><b>£6.95</b></label>
              </div>
            </section>
            <section className="checkout-section checkout-payment-section">
              <div className="checkout-section-heading"><span>03</span><div><h2>Payment</h2><p>Your card details are encrypted and sent directly to Stripe.</p></div></div>
              <div className="checkout-stripe-note"><strong>Pay securely with Stripe</strong><span>Card payments · protected checkout</span></div>
              {savedPaymentMethods.length > 0 && <div className="checkout-saved-cards" aria-label="Saved payment methods">
                <p>Choose a saved card or enter a new one.</p>
                {savedPaymentMethods.map((method) => <label key={method.id}><input type="radio" name="saved-payment-method" checked={selectedPaymentMethodId === method.id} onChange={() => setSelectedPaymentMethodId(method.id)} /><span><strong>{method.brand.toUpperCase()} ending in {method.last4}</strong><small>Expires {String(method.expMonth).padStart(2, "0")}/{method.expYear}</small></span></label>)}
                <label><input type="radio" name="saved-payment-method" checked={!selectedPaymentMethodId} onChange={() => setSelectedPaymentMethodId("")} /><span><strong>Use a new card</strong><small>Securely save it with Stripe for later</small></span></label>
              </div>}
              {paymentSetupError ? <p className="checkout-payment-error" role="alert">{paymentSetupError}</p> : !selectedPaymentMethodId && <div className="checkout-card-field" ref={cardMountRef} data-testid="stripe-card-field" aria-label="Card details" />}
              {cardError && <p className="checkout-payment-error" role="alert">{cardError}</p>}
            </section>
            {paymentError && <p className="checkout-payment-error" role="alert">{paymentError}</p>}
          </div>
          <aside className="checkout-order-review">
            <div className="checkout-order-heading"><h2>Your order</h2><span>{cartLines.reduce((count, { item }) => count + item.quantity, 0)} item{cartLines.reduce((count, { item }) => count + item.quantity, 0) === 1 ? "" : "s"}</span></div>
            {cartLines.length === 0 ? <div className="checkout-empty-order"><p>Your bag is empty.</p><a className="text-link" href="/shop">Continue shopping</a></div> : <div className="checkout-order-items">{cartLines.map(({ item, product, variation }) => <article className="checkout-order-item" key={`${item.productId}-${item.variationId ?? item.size}-${item.colour ?? ""}`}><img src={product.image} alt={product.name} style={{ objectPosition: product.position }} /><div><h3>{product.name}</h3><p>{[item.size !== "One size" ? item.size : "", item.colour ?? ""].filter(Boolean).join(" · ") || "One size"} · Qty {item.quantity}</p></div><strong>{formatPounds(parsePounds(variation?.price ?? product.price) * item.quantity)}</strong></article>)}</div>}
            <div className="checkout-totals"><div><span>Subtotal</span><strong>{formatPounds(subtotal)}</strong></div><div><span>Delivery</span><strong>{deliveryAmount === 0 ? "Free" : formatPounds(deliveryAmount)}</strong></div><div className="checkout-total"><span>Total</span><strong>{formatPounds(total)}</strong></div></div>
            <button className="button checkout-pay-button" type="submit" disabled={!isLoaded || !isSignedIn || isPaying || !publishableKey || Boolean(paymentSetupError) || cartLines.length === 0} data-testid="button-place-order">{isPaying ? "Processing secure payment…" : !isLoaded ? "Checking account…" : !isSignedIn ? "Sign in to checkout" : !publishableKey ? "Loading secure payment…" : `Pay securely · ${formatPounds(total)}`}</button>
            <p className="checkout-security-copy">Your card details never touch Glam Too&apos;s servers. Stripe processes your payment securely.</p>
          </aside>
        </form>
      </main>
    </Shell>
  );
}

function Confirmation() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("payment_intent") || params.has("stripe_session_id")) clearCart();
  }, []);

  return <Shell><div className="container confirmation"><div className="confirmation-mark">✓</div><div className="eyebrow">Order received</div><h1>It&apos;s a yes.</h1><p>Thank you for shopping Glam Too. Your order GM-260214 is being wrapped with care. We&apos;ve sent all the details to your inbox.</p><a className="button button-pink" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a></div></Shell>;
}

function CustomerSignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Shell><div className="customer-auth-page"><p>Loading your account…</p></div></Shell>;
  return isSignedIn ? <CustomerAccountPage /> : <CustomerSignInContent />;
}

function CustomerSignInContent() {
  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">Your Glam Too account</div><h1>Welcome back.</h1><p>Sign in to manage your details and make shopping your next plan even easier.</p></div><div className="customer-auth-card"><SignIn signUpUrl={`${basePath}/register`} fallbackRedirectUrl={basePath || '/'} /><a className="customer-recovery-link" href={`${basePath}/account/recovery`}>Forgot your password?</a></div></div></Shell>;
}

function formatCustomerOrderDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatCustomerOrderCountry(value: string) {
  if (value.toUpperCase() === "GB" || value.toUpperCase() === "UK") return "United Kingdom";
  return value;
}

function CustomerOrderDetailPage({ order, onBack }: { order: CustomerOrder; onBack: () => void }) {
  const itemSubtotal = order.items.reduce((total, item) => total + item.total, 0);
  const deliveryAmount = Math.max(order.total - itemSubtotal, 0);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const addressParts = [
    order.delivery.address.line1,
    order.delivery.address.line2,
    order.delivery.address.city,
    order.delivery.address.postcode,
    formatCustomerOrderCountry(order.delivery.address.country),
  ].filter(Boolean);

  return (
    <div className="account-order-page">
      <div className="account-order-page-topbar">
        <button className="account-order-back" type="button" onClick={onBack}>← Back to orders</button>
        <span>Glam Too order history</span>
      </div>
      <div className="account-order-page-heading">
        <div>
          <div className="eyebrow">Order details</div>
          <h2>{order.id}</h2>
          <p>Placed {formatCustomerOrderDate(order.placedAt)}</p>
        </div>
        <div className="account-order-page-total">
          <strong>{formatPounds(order.total / 100)}</strong>
          <span className={`account-order-status ${order.status.toLowerCase().replace(/\s+/g, "-")}`}>{order.status}</span>
        </div>
      </div>

      <div className="account-order-page-layout">
        <section className="account-order-detail-card">
          <div className="account-order-detail-heading">
            <div><div className="eyebrow">Your purchase</div><h3>Items</h3></div>
            <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          </div>
          {order.items.length > 0 ? (
            <div className="account-order-detail-items">
              {order.items.map((item, index) => (
                <div className="account-order-detail-item" key={`${item.productId ?? item.name}-${index}`}>
                  <div><strong>{item.name}</strong><span>Quantity {item.quantity}</span></div>
                  <strong>{formatPounds(item.total / 100)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="account-muted">Item details are being prepared.</p>}
          <div className="account-order-detail-totals">
            <div><span>Items subtotal</span><strong>{formatPounds(itemSubtotal / 100)}</strong></div>
            {deliveryAmount > 0 && <div><span>{order.delivery.method}</span><strong>{formatPounds(deliveryAmount / 100)}</strong></div>}
            <div className="account-order-detail-total"><span>Order total</span><strong>{formatPounds(order.total / 100)}</strong></div>
          </div>
        </section>

        <aside className="account-order-page-sidebar">
          <section className="account-order-detail-card">
            <div className="account-order-detail-heading"><div><div className="eyebrow">Delivery</div><h3>Delivery details</h3></div></div>
            <dl className="account-order-detail-list">
              <div><dt>Method</dt><dd>{order.delivery.method}</dd></div>
              <div><dt>Recipient</dt><dd>{order.delivery.name || "Recipient unavailable"}</dd></div>
            </dl>
            <address className="account-order-detail-address">
              {addressParts.length > 0 ? addressParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>) : <span>Address unavailable</span>}
            </address>
          </section>
          <section className="account-order-detail-card">
            <div className="account-order-detail-heading"><div><div className="eyebrow">Payment</div><h3>Payment details</h3></div></div>
            <dl className="account-order-detail-list">
              <div><dt>Payment status</dt><dd>Paid</dd></div>
              <div><dt>Payment method</dt><dd>Card via Stripe</dd></div>
              <div><dt>Email receipt</dt><dd>{order.email || "Email unavailable"}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PaymentMethodsPanel({ profile }: { profile: CustomerProfile }) {
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [publishableKey, setPublishableKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeSetupRef = useRef<{ stripe: StripeJs; card: StripeCardElement } | null>(null);

  async function loadPaymentMethods() {
    const response = await fetch("/api/stripe/payment-methods", { credentials: "include" });
    const result = await response.json() as { paymentMethods?: SavedPaymentMethod[]; error?: string };
    if (!response.ok) throw new Error(result.error || "Your saved payment methods could not be loaded.");
    setPaymentMethods(Array.isArray(result.paymentMethods) ? result.paymentMethods : []);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/stripe/payment-config", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !result.publishableKey) throw new Error(result.error || "Stripe card fields are unavailable.");
        return result.publishableKey;
      }),
      fetch("/api/stripe/payment-methods", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { paymentMethods?: SavedPaymentMethod[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Your saved payment methods could not be loaded.");
        return Array.isArray(result.paymentMethods) ? result.paymentMethods : [];
      }),
    ])
      .then(([key, methods]) => {
        if (cancelled) return;
        setPublishableKey(key);
        setPaymentMethods(methods);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Your payment methods could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publishableKey || !cardMountRef.current) return;
    let cancelled = false;
    let card: StripeCardElement | null = null;
    void loadStripeJs()
      .then(() => {
        const stripe = window.Stripe?.(publishableKey);
        if (!stripe || !cardMountRef.current) throw new Error("Stripe card fields could not be initialized.");
        card = stripe.elements().create("card", {
          disableLink: true,
          hidePostalCode: true,
          style: {
            base: { color: "#171615", fontFamily: "DM Sans, sans-serif", fontSize: "16px", "::placeholder": { color: "#827975" } },
            invalid: { color: "#b42342" },
          },
        });
        if (cancelled) {
          card.destroy();
          return;
        }
        card.mount(cardMountRef.current);
        card.on("change", (event) => setError(event.error?.message ?? ""));
        stripeSetupRef.current = { stripe, card };
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Stripe card fields are unavailable.");
      });
    return () => {
      cancelled = true;
      stripeSetupRef.current = null;
      card?.destroy();
    };
  }, [publishableKey]);

  async function savePaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripeSetupRef.current) {
      setError("Stripe card fields are still loading. Please wait a moment and try again.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      const setupResponse = await fetch("/api/stripe/payment-method-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: profile.email }),
      });
      const setup = await setupResponse.json() as { clientSecret?: string; error?: string };
      if (!setupResponse.ok || !setup.clientSecret) throw new Error(setup.error || "Your card could not be saved.");
      const confirmation = await stripeSetupRef.current.stripe.confirmCardSetup(setup.clientSecret, {
        payment_method: {
          card: stripeSetupRef.current.card,
          billing_details: {
            name,
            email: profile.email,
            phone: profile.phone || undefined,
            address: {
              line1: profile.addressLine1 || undefined,
              line2: profile.addressLine2 || undefined,
              city: profile.city || undefined,
              postal_code: profile.postcode || undefined,
              country: profile.country || "GB",
            },
          },
        },
      });
      if (confirmation.error) throw new Error(confirmation.error.message || "Your card could not be saved.");
      if (confirmation.setupIntent?.status !== "succeeded") throw new Error("Your card needs additional confirmation. Please try again.");
      await loadPaymentMethods();
      setNotice("Your card has been saved securely with Stripe.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your card could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removePaymentMethod(paymentMethodId: string) {
    setRemovingId(paymentMethodId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/stripe/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "That card could not be removed.");
      }
      setPaymentMethods((current) => current.filter((method) => method.id !== paymentMethodId));
      setNotice("Your saved card has been removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That card could not be removed.");
    } finally {
      setRemovingId("");
    }
  }

  return (
    <section className="account-panel account-payment-panel">
      <div className="eyebrow">Protected by Stripe</div>
      <h2>Payment methods.</h2>
      <p>Your card details are encrypted and saved by Stripe. Glam Too never stores your full card number.</p>
      {loading ? <p className="account-muted">Loading your saved cards…</p> : (
        <div className="saved-payment-methods">
          {paymentMethods.length === 0 ? <p className="account-empty-copy">No payment methods saved yet.</p> : paymentMethods.map((method) => (
            <div className="saved-payment-method" key={method.id}>
              <div><strong>{method.brand.toUpperCase()} ending in {method.last4}</strong><span>Expires {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span></div>
              <button type="button" onClick={() => void removePaymentMethod(method.id)} disabled={removingId === method.id}>{removingId === method.id ? "Removing…" : "Remove"}</button>
            </div>
          ))}
        </div>
      )}
      <form className="account-payment-form" onSubmit={(event) => void savePaymentMethod(event)}>
        <h3>Add a card</h3>
        <div className="checkout-card-field account-card-field" ref={cardMountRef} aria-label="Card details to save" />
        {error && <p className="account-form-error" role="alert">{error}</p>}
        {notice && <p className="account-form-success" role="status">{notice}</p>}
        <button className="button button-pink" type="submit" disabled={saving || loading || !publishableKey}>{saving ? "Saving card…" : "Save payment method"}</button>
      </form>
    </section>
  );
}

function CustomerAccountPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountSection, setAccountSection] = useState<AccountSection>("dashboard");
  const [details, setDetails] = useState({ firstName: "", lastName: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsNotice, setDetailsNotice] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [profile, setProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [profileLoading, setProfileLoading] = useState(true);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressError, setAddressError] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    function handleLogoutDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLogoutConfirmOpen(false);
    }
    window.addEventListener("keydown", handleLogoutDialogKeyDown);
    return () => window.removeEventListener("keydown", handleLogoutDialogKeyDown);
  }, [logoutConfirmOpen]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/stripe/orders", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { orders?: CustomerOrder[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Your orders could not be loaded right now.");
        if (!cancelled) setOrders(Array.isArray(result.orders) ? result.orders : []);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Your orders could not be loaded right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!user) return;
    setDetails({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });
    setProfile((current) => ({
      ...current,
      firstName: current.firstName || user.firstName || "",
      lastName: current.lastName || user.lastName || "",
      email: current.email || user.primaryEmailAddress?.emailAddress || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    fetch("/api/account/profile", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { profile?: CustomerProfile; error?: string };
        if (!response.ok || !result.profile) throw new Error(result.error || "Your saved details could not be loaded.");
        if (!cancelled) {
          setProfile(result.profile);
          setDetails({
            firstName: result.profile.firstName,
            lastName: result.profile.lastName,
          });
        }
      })
      .catch((caught) => {
        if (!cancelled) setAddressError(caught instanceof Error ? caught.message : "Your saved details could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  async function saveProfile(nextProfile: CustomerProfile) {
    const response = await fetch("/api/account/profile", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextProfile),
    });
    const result = await response.json() as { profile?: CustomerProfile; error?: string };
    if (!response.ok || !result.profile) throw new Error(result.error || "Your saved details could not be saved.");
    setProfile((current) => ({ ...current, ...result.profile, email: current.email }));
  }

  async function saveAccountDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setDetailsSaving(true);
    setDetailsNotice("");
    setDetailsError("");
    try {
      await saveProfile({
        ...profile,
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
      });
      setDetailsNotice("Your account details have been saved.");
    } catch (caught) {
      setDetailsError(caught instanceof Error ? caught.message : "Your account details could not be saved.");
    } finally {
      setDetailsSaving(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressError("");
    setAddressNotice("");
    try {
      await saveProfile({
        ...profile,
        firstName: details.firstName.trim() || profile.firstName,
        lastName: details.lastName.trim() || profile.lastName,
      });
      setAddressNotice("Your delivery address has been saved and will be ready at checkout.");
    } catch (caught) {
      setAddressError(caught instanceof Error ? caught.message : "Your delivery address could not be saved.");
    } finally {
      setAddressSaving(false);
    }
  }

  if (!isLoaded) return <Shell><div className="customer-auth-page"><p>Loading your account…</p></div></Shell>;
  if (!isSignedIn) return <CustomerSignInContent />;

  const accountName = profile.firstName || user?.firstName || user?.username || "there";
  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null;
  const accountSections: Array<{ id: AccountSection; label: string; icon: LucideIcon }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "addresses", label: "Addresses", icon: MapPin },
    { id: "payment-methods", label: "Payment methods", icon: CreditCard },
    { id: "account-details", label: "Account details", icon: UserRound },
  ];
  const sectionCopy: Record<AccountSection, { title: string; description: string }> = {
    dashboard: { title: "Your account.", description: "Manage your orders, details, and delivery preferences in one place." },
    orders: { title: "Your orders.", description: "Everything you’ve bought from us, in one lovely place." },
    addresses: { title: "Your addresses.", description: "Keep your delivery details close for a smoother checkout." },
    "payment-methods": { title: "Payment methods.", description: "Your payments stay protected by Stripe from checkout to confirmation." },
    "account-details": { title: "Account details.", description: "Keep your personal details up to date." },
  };
  const activeSectionCopy = selectedOrder && accountSection === "orders"
    ? { title: "Order details.", description: "Review your purchase, delivery, and payment information." }
    : sectionCopy[accountSection];

  return (
    <Shell>
      <div className="account-page">
        <div className="account-heading">
          <div>
            <div className="eyebrow">Your Glam Too account</div>
            <h1>{activeSectionCopy.title}</h1>
            <p>{activeSectionCopy.description}</p>
          </div>
        </div>

        <div className="account-layout">
          <nav className="account-nav" aria-label="Account navigation">
            <div className="account-nav-links">
              {accountSections.map((section) => (
                <button
                  className={accountSection === section.id ? "is-active" : ""}
                  type="button"
                  key={section.id}
                  onClick={() => { setAccountSection(section.id); setSelectedOrderId(null); }}
                  aria-current={accountSection === section.id ? "page" : undefined}
                >
                  <section.icon className="account-nav-icon" aria-hidden="true" />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
            <button className="account-nav-logout" type="button" onClick={() => setLogoutConfirmOpen(true)}><LogOut className="account-nav-icon" aria-hidden="true" /><span>Log out</span></button>
          </nav>

          <div className="account-content">
            {accountSection === "dashboard" && (
              <section className="account-panel account-dashboard">
                <div className="eyebrow">Hello, {accountName}</div>
                <h2>Welcome back.</h2>
                <p>From your account dashboard you can view your recent orders, manage your addresses, and edit your account details.</p>
                <div className="account-shortcuts">
                  <button type="button" onClick={() => setAccountSection("orders")}><span>Orders</span><strong>{orders.length}</strong><small>View your purchases</small></button>
                  <button type="button" onClick={() => setAccountSection("addresses")}><span>Addresses</span><strong>→</strong><small>Manage delivery details</small></button>
                  <button type="button" onClick={() => setAccountSection("account-details")}><span>Account details</span><strong>→</strong><small>Update your information</small></button>
                </div>
              </section>
            )}

            {accountSection === "orders" && (
              <>
                {selectedOrder ? <CustomerOrderDetailPage order={selectedOrder} onBack={() => setSelectedOrderId(null)} /> : (
                  <>
                    {error && <div className="account-message account-error" role="alert">{error}</div>}
                    {loading ? (
                      <div className="account-message">Loading your orders…</div>
                    ) : orders.length === 0 ? (
                      <section className="account-empty">
                        <div className="eyebrow">Nothing here yet</div>
                        <h2>Your next favourite is out there.</h2>
                        <p>Once you place an order while signed in, it will appear here with its delivery details.</p>
                        <a className="button button-pink" href="/shop">Start shopping</a>
                      </section>
                    ) : (
                      <div className="account-orders-table" role="table" aria-label="Your orders">
                        <div className="account-orders-table-head" role="row">
                          <span>Order</span><span>Date</span><span>Status</span><span>Total</span><span>Actions</span>
                        </div>
                        {orders.map((order) => {
                          const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
                          return (
                            <div className="account-orders-table-row" role="row" key={order.id}>
                              <button className="account-order-number" type="button" onClick={() => setSelectedOrderId(order.id)}>{order.id}</button>
                              <span>{formatCustomerOrderDate(order.placedAt)}</span>
                              <span className={`account-order-status ${order.status.toLowerCase().replace(/\s+/g, "-")}`}>{order.status}</span>
                              <span className="account-order-total-cell"><strong>{formatPounds(order.total / 100)}</strong><small>{itemCount} item{itemCount === 1 ? "" : "s"}</small></span>
                              <button className="account-order-view-button" type="button" onClick={() => setSelectedOrderId(order.id)}>View</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {accountSection === "addresses" && (
              <section className="account-panel">
                <div className="eyebrow">Delivery book</div>
                <h2>Addresses.</h2>
                <p>Save your default UK delivery address here and we&apos;ll prefill it at checkout.</p>
                <form className="account-details-form" onSubmit={(event) => void saveAddress(event)}>
                  <div className="account-details-fields">
                    <div className="field account-field-wide"><label htmlFor="account-address-line-one">Street address</label><input id="account-address-line-one" type="text" required value={profile.addressLine1} onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))} placeholder="House number and street name" /></div>
                    <div className="field account-field-wide"><label htmlFor="account-address-line-two">Address line 2 <span>Optional</span></label><input id="account-address-line-two" type="text" value={profile.addressLine2} onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))} placeholder="Apartment, suite, unit, etc." /></div>
                    <div className="field"><label htmlFor="account-address-city">Town or city</label><input id="account-address-city" type="text" required value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-postcode">Postcode</label><input id="account-address-postcode" type="text" required value={profile.postcode} onChange={(event) => setProfile((current) => ({ ...current, postcode: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-phone">Phone <span>Optional</span></label><input id="account-address-phone" type="tel" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-country">Country / region</label><input id="account-address-country" type="text" value="United Kingdom" readOnly /></div>
                  </div>
                  {addressError && <p className="account-form-error" role="alert">{addressError}</p>}
                  {addressNotice && <p className="account-form-success" role="status">{addressNotice}</p>}
                  <button className="button button-pink" type="submit" disabled={addressSaving || profileLoading}>{addressSaving ? "Saving address…" : "Save delivery address"}</button>
                </form>
              </section>
            )}

            {accountSection === "payment-methods" && (
              <PaymentMethodsPanel profile={profile} />
            )}

            {accountSection === "account-details" && (
              <section className="account-panel">
                <div className="eyebrow">Your information</div>
                <h2>Account details.</h2>
                <form className="account-details-form" onSubmit={(event) => void saveAccountDetails(event)}>
                  <div className="account-details-fields">
                    <div className="field"><label htmlFor="account-first-name">First name</label><input id="account-first-name" type="text" value={details.firstName} onChange={(event) => setDetails((current) => ({ ...current, firstName: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-last-name">Last name</label><input id="account-last-name" type="text" value={details.lastName} onChange={(event) => setDetails((current) => ({ ...current, lastName: event.target.value }))} /></div>
                    <div className="field account-field-wide"><label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={user?.primaryEmailAddress?.emailAddress ?? ""} readOnly /></div>
                  </div>
                  {detailsError && <p className="account-form-error" role="alert">{detailsError}</p>}
                  {detailsNotice && <p className="account-form-success" role="status">{detailsNotice}</p>}
                  <button className="button button-pink" type="submit" disabled={detailsSaving}>{detailsSaving ? "Saving details…" : "Save changes"}</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
      {logoutConfirmOpen && (
        <div
          className="account-logout-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLogoutConfirmOpen(false);
          }}
        >
          <div className="account-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" aria-describedby="logout-dialog-description">
            <div className="eyebrow">Sign out</div>
            <h2 id="logout-dialog-title">Log out of your account?</h2>
            <p id="logout-dialog-description">You&apos;ll need to sign in again to view your orders and account details.</p>
            <div className="account-logout-actions">
              <button className="button account-logout-cancel" type="button" onClick={() => setLogoutConfirmOpen(false)}>Cancel</button>
              <button className="button button-pink" type="button" onClick={() => { setLogoutConfirmOpen(false); void signOut({ redirectUrl: basePath || "/" }); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function CustomerSignUpPage() {
  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">New here?</div><h1>Create your account.</h1><p>Register to keep your Glam Too details ready for every checkout.</p></div><SignUp signInUrl={`${basePath}/account`} fallbackRedirectUrl={basePath || '/'} /></div></Shell>;
}

function PasswordRecoveryPage() {
  const { signIn } = useSignIn();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getErrorMessage = (caught: unknown) => {
    if (typeof caught === "object" && caught && "errors" in caught) {
      const errors = (caught as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
      return errors?.[0]?.longMessage || errors?.[0]?.message || "We could not complete that step. Please try again.";
    }
    return "We could not complete that step. Please try again.";
  };

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const createResult = await signIn.create({ identifier: email });
      if (createResult.error) throw createResult.error;
      const sendResult = await signIn.resetPasswordEmailCode.sendCode();
      if (sendResult.error) throw sendResult.error;
      setStep("code");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("No password") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyResult.error || signIn.status !== "needs_new_password") throw new Error("That code could not be verified. Please try again.");
      setStep("password");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("code could") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const passwordResult = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (passwordResult.error || signIn.status !== "complete") throw new Error("Your password could not be updated. Please try again.");
      const finalizeResult = await signIn.finalize();
      if (finalizeResult.error) throw finalizeResult.error;
      setLocation("/");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("could not") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const titles = {
    email: ["Reset your password.", "Enter the email address on your Glam Too account and we’ll send a secure verification code."],
    code: ["Check your inbox.", "Enter the verification code sent to your email address."],
    password: ["Choose a new password.", "Your new password will replace your previous one after you save it."],
  } as const;

  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">Account recovery</div><h1>{titles[step][0]}</h1><p>{titles[step][1]}</p></div><section className="customer-recovery-card">
    {step === "email" && <form onSubmit={requestCode}><label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Sending…" : "Send recovery code"}</button></form>}
    {step === "code" && <form onSubmit={verifyCode}><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Checking…" : "Verify code"}</button></form>}
    {step === "password" && <form onSubmit={resetPassword}><label>New password<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Saving…" : "Save new password"}</button></form>}
    {error && <p className="customer-recovery-error" role="alert">{error}</p>}
    <a href={`${basePath}/account`}>Back to sign in</a>
  </section></div></Shell>;
}

function AdminSignInPage() {
  return <div className="admin-auth-page"><div className="admin-signin-wrap"><SignIn signUpUrl={`${basePath}/register`} fallbackRedirectUrl={`${basePath}/admin`} /><p>Customer registration does not grant admin access. Admin access is granted manually by an approved administrator.</p></div></div>;
}

function AdminAccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return <div className="admin-auth-page"><div className="admin-access-denied"><div className="eyebrow">Private studio</div><h1>Admin access only.</h1><p>This account is signed in, but it is not approved to access the Glam Too admin area.</p><div className="admin-access-actions"><button className="button" type="button" onClick={onSignOut}>Sign out</button><a className="text-link" href="/">Return to storefront</a></div></div></div>;
}

function AdminRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "denied" | "error">("checking");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAccessState("checking");
      return;
    }

    let cancelled = false;
    setAccessState("checking");
    fetch("/api/admin/access", { credentials: "include" })
      .then((response) => {
        if (cancelled) return;
        setAccessState(response.ok ? "allowed" : response.status === 403 ? "denied" : "error");
      })
      .catch(() => {
        if (!cancelled) setAccessState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <div className="admin-auth-page"><p>Loading secure admin access…</p></div>;
  if (!isSignedIn) return <AdminSignInPage />;
  if (accessState === "checking") return <div className="admin-auth-page"><p>Verifying admin access…</p></div>;
  if (accessState === "denied") return <AdminAccessDenied onSignOut={() => void signOut({ redirectUrl: basePath || '/' })} />;
  if (accessState === "error") return <div className="admin-auth-page"><div className="admin-access-denied"><div className="eyebrow">Private studio</div><h1>Access check unavailable.</h1><p>We could not verify this account right now. Please try again shortly.</p><div className="admin-access-actions"><button className="button" type="button" onClick={() => window.location.reload()}>Try again</button><a className="text-link" href="/">Return to storefront</a></div></div></div>;
  return <AdminDashboard onSignOut={() => signOut({ redirectUrl: basePath || '/' })} />;
}

function AppRoutes() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
    <Route path="/shop" component={Shop} />
    <Route path="/product/:slug" component={ProductDetail} />
    <Route path="/category" component={CategoryIndex} />
    <Route path="/category/:slug" component={CategoryDetail} />
    <Route path="/faq" component={FAQ} />
    <Route path="/contact" component={Contact} />
    <Route path="/privacy" component={() => <LegalPage type="privacy" />} />
    <Route path="/terms" component={() => <LegalPage type="terms" />} />
    <Route path="/delivery-returns" component={() => <LegalPage type="delivery" />} />
    <Route path="/cart" component={Cart} />
    <Route path="/checkout" component={Checkout} />
    <Route path="/order-confirmation" component={Confirmation} />
    <Route path="/admin" component={AdminRoute} />
    <Route path="/account/recovery/*?" component={PasswordRecoveryPage} />
    <Route path="/account/*?" component={CustomerSignInPage} />
    <Route path="/register/*?" component={CustomerSignUpPage} />
    <Route path="/sign-in/*?" component={CustomerSignInPage} />
    <Route path="/sign-up/*?" component={CustomerSignUpPage} />
    <Route component={NotFound} />
  </Switch>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/account`}
      signUpUrl={`${basePath}/register`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <AppRoutes />
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;
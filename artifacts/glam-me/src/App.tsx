import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import fashionImage from '@assets/glam-me-20260814-final-v2_1787646629461.png';
import logoImage from '@assets/glam_me_logo_1787652435373.svg';
import heroImage from '@assets/glam-me-home-banner_1787651354578.png';
import { catalogCategories, catalogProducts, createProductSlug, formatCatalogPrice, type CatalogCategory, type CatalogProduct } from '@/data/catalog';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
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
          <a href="/about" className="tool-label icon-link" aria-label="Account" data-testid="link-account">
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
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const products = getStorefrontProducts();
  const cartLines = getCartItems().flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variation = product?.type === "Variable"
      ? product.variations.find((candidate) => candidate.id === item.variationId)
      : undefined;
    return product ? [{ item, product, variation }] : [];
  });
  const subtotal = cartLines.reduce((total, { item, product, variation }) => total + parsePounds(variation?.price ?? product.price) * item.quantity, 0);

  async function beginStripeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cartLines.length === 0) {
      setPaymentError("Your bag is empty. Add a piece before checking out.");
      return;
    }

    setIsRedirecting(true);
    setPaymentError("");
    const formData = new FormData(event.currentTarget);
    const delivery = String(formData.get("delivery") ?? "standard");
    const lines = cartLines.map(({ item, product, variation }) => ({
      productId: String(product.id),
      variationId: variation ? String(variation.id) : undefined,
      quantity: item.quantity,
    }));

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          customerName: formData.get("name"),
          lines,
          delivery,
        }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Stripe checkout is not available right now.");
      window.location.assign(result.url);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to start Stripe checkout.");
      setIsRedirecting(false);
    }
  }

  const deliveryCharge = "Free";
  const total = subtotal;
  return <Shell><div className="container form-page"><div className="form-layout"><div className="form-copy"><div className="eyebrow">Nearly yours</div><h1>Checkout.</h1><p>Complete your details below, then pay securely on Stripe&apos;s hosted checkout.</p><a className="text-link" href="/cart">Return to bag</a></div><form className="form-stack" onSubmit={beginStripeCheckout}><div className="field"><label htmlFor="checkout-email">Email address</label><input id="checkout-email" name="email" type="email" required data-testid="input-checkout-email" /></div><div className="field"><label htmlFor="checkout-name">Full name</label><input id="checkout-name" name="name" type="text" required data-testid="input-checkout-name" /></div><div className="field"><label htmlFor="checkout-address">Address</label><input id="checkout-address" name="address" type="text" required data-testid="input-checkout-address" /></div><div className="field"><label htmlFor="checkout-city">Town or city</label><input id="checkout-city" name="city" type="text" required data-testid="input-checkout-city" /></div><div className="field"><label htmlFor="checkout-postcode">Postcode</label><input id="checkout-postcode" name="postcode" type="text" required data-testid="input-checkout-postcode" /></div><div className="field"><label htmlFor="checkout-delivery">Delivery method</label><select id="checkout-delivery" name="delivery" defaultValue="standard" data-testid="select-checkout-delivery"><option value="standard">Standard · {deliveryCharge}</option><option value="express">Express · £6.95</option></select></div>{paymentError && <p className="checkout-payment-error" role="alert">{paymentError}</p>}<button className="button" type="submit" disabled={isRedirecting || cartLines.length === 0} data-testid="button-place-order">{isRedirecting ? "Opening secure checkout…" : `Pay securely · ${formatPounds(total)}`}</button></form></div></div></Shell>;
}

function Confirmation() {
  return <Shell><div className="container confirmation"><div className="confirmation-mark">✓</div><div className="eyebrow">Order received</div><h1>It&apos;s a yes.</h1><p>Thank you for shopping Glam Too. Your order GM-260214 is being wrapped with care. We&apos;ve sent all the details to your inbox.</p><a className="button button-pink" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a></div></Shell>;
}

function SignInPage() {
  return <div className="admin-auth-page"><SignIn signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/admin`} /></div>;
}

function SignUpPage() {
  return <div className="admin-auth-page"><SignUp signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/admin`} /></div>;
}

function AdminRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  if (!isLoaded) return <div className="admin-auth-page"><p>Loading secure admin access…</p></div>;
  if (!isSignedIn) return <SignInPage />;
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
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
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
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
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
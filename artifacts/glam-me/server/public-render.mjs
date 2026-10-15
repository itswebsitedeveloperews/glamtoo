import { API_ORIGIN } from './seo.mjs';
import { serializeStructuredData } from './structured.mjs';

export function needsCatalog(pathname) {
  return pathname === '/' || pathname === '/shop' || pathname === '/category'
    || /^\/(?:category|product)\/[^/]+\/?$/.test(pathname);
}

export function isPublicTemplate(pathname) {
  return needsCatalog(pathname) || ['/about', '/faq', '/contact', '/privacy', '/terms', '/returns', '/delivery-returns'].includes(pathname);
}

async function publicJson(endpoint, fetcher, timeoutMs = 4000) {
  // No inbound cookies, authorization headers or user-controlled origins.
  const response = await fetcher(`${API_ORIGIN}/api/${endpoint}`, {
    signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Public ${endpoint} unavailable`);
  return response.json();
}

async function publicProductReviews(catalog, pathname, fetcher) {
  const match = /^\/product\/([^/]+)\/?$/.exec(pathname);
  if (!match || !Array.isArray(catalog.products)) return undefined;
  let slug;
  try { slug = decodeURIComponent(match[1]); } catch { return undefined; }
  const product = catalog.products.find(p => p.status === 'Published' && (p.slug === slug || String(p.id) === slug));
  if (!product) return undefined;
  const productId = Number(product.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return undefined;
  try {
    // Optional content must not hold the entire product page behind a slow or
    // unavailable review service. Never call the private eligibility endpoint.
    const data = await publicJson(`products/${productId}/reviews?page=1`, fetcher, 800);
    if (!Number.isInteger(data.total) || data.total < 0 || !Number.isFinite(data.averageRating)
      || data.averageRating < 0 || data.averageRating > 5 || data.page !== 1
      || !Number.isInteger(data.pageSize) || data.pageSize < 1 || data.pageSize > 100
      || !Array.isArray(data.reviews) || data.reviews.length > data.pageSize
      || data.reviews.length > data.total) throw new Error('Invalid public review summary');
    const reviews = data.reviews.map(r => {
      if (!Number.isInteger(r.id) || r.productId !== productId || !Number.isInteger(r.rating)
        || r.rating < 1 || r.rating > 5 || r.verifiedPurchase !== true
        || ![r.title, r.body, r.displayName, r.createdAt].every(v => typeof v === 'string')
        || !Number.isFinite(Date.parse(r.createdAt))) throw new Error('Invalid public review');
      // Explicit public whitelist, even if the API later gains private fields.
      return { id: r.id, productId, rating: r.rating, title: r.title, body: r.body,
        displayName: r.displayName, createdAt: r.createdAt, verifiedPurchase: true };
    });
    return { productId, data: { reviews, averageRating: data.averageRating, total: data.total, page: 1, pageSize: data.pageSize } };
  } catch {
    console.warn(`Public reviews temporarily unavailable for product ${productId}`);
    return { productId, unavailable: true };
  }
}

export async function loadPublicSnapshot(fetcher = fetch, pathname = '/') {
  const policies = ['/faq', '/returns', '/delivery-returns'].includes(pathname) || pathname.startsWith('/product/');
  // Independent public data loads in parallel, rather than making policy
  // requests finish before the catalogue/inventory requests can even start.
  const policyRequest = policies ? Promise.all([
    publicJson('shipping-methods', fetcher),
    publicJson('return-information', fetcher),
  ]) : Promise.resolve(null);
  const catalogRequest = needsCatalog(pathname) ? publicJson('catalog', fetcher) : Promise.resolve(null);
  const [policyData, catalogData, productReviews, announcements, heroSlides] = await Promise.all([
    policyRequest,
    needsCatalog(pathname) ? Promise.all([
      catalogRequest, publicJson('inventory', fetcher), publicJson('stripe/product-sales', fetcher),
    ]) : Promise.resolve(null),
    catalogRequest.then(catalog => catalog ? publicProductReviews(catalog, pathname, fetcher) : undefined),
    publicJson('announcements', fetcher, 800).then(data => {
      if (!Array.isArray(data.announcements)) throw new Error('Invalid announcements');
      // Keep optional marketing data isolated from catalogue availability.
      return data.announcements.filter(item => item.enabled === true).map(({ id, text, link, displayOrder, enabled, revision }) => ({
        id, text, link, displayOrder, enabled, revision,
      }));
    }).catch(() => { console.warn('Public announcements unavailable; storefront remains available.'); return undefined; }),
    pathname.split('?')[0] === '/' ? publicJson('hero-slides', fetcher, 1200).then(data => {
      if (!Array.isArray(data.slides)) throw new Error('Invalid hero slides');
      return data.slides.filter(slide => slide.enabled === true).map(({
        id, revision, desktopImage, mobileImage, heading, text, ctaText, ctaLink, altText, textPosition, displayOrder, enabled,
      }) => ({ id, revision, desktopImage, mobileImage, heading, text, ctaText, ctaLink, altText, textPosition, displayOrder, enabled }));
    }).catch(() => { console.warn('Homepage slides unavailable; remaining storefront stays available.'); return undefined; }) : undefined,
  ]);
  const extra = policyData ? {
    shippingMethods: policyData[0].shippingMethods,
    returnInformation: policyData[1].content,
  } : {};
  if (policyData && (!Array.isArray(extra.shippingMethods) || typeof extra.returnInformation !== 'string')) throw new Error('Public policies unavailable');
  // Informational pages do not depend on catalog availability. Their shared
  // navigation refreshes normally in the browser after hydration.
  if (!needsCatalog(pathname)) return {
    products: [], categories: [], homePage: null, inventory: {}, sales: {},
    catalogReady: false, ...extra, ...(announcements ? { announcements } : {}),
  };
  const [catalog, stock, sales] = catalogData;
  if (!catalog.initialized || !Array.isArray(catalog.products) || !Array.isArray(catalog.categories)
    || !stock.inventory || !sales.sales) throw new Error('Public catalog unavailable');
  // Deliberately select the public payload instead of serializing an entire response.
  return {
    products: catalog.products.filter(product => product.status === 'Published'),
    categories: catalog.categories, homePage: catalog.homePage ?? null,
    inventory: stock.inventory, sales: sales.sales, ...extra,
    ...(productReviews ? { productReviews } : {}),
    ...(announcements ? { announcements } : {}),
    ...(heroSlides ? { heroSlides } : {}),
  };
}

export async function injectPublicBody(html, pathname, { fetcher = fetch, render } = {}) {
  if (!isPublicTemplate(pathname.split('?')[0])) return html;
  const snapshot = await loadPublicSnapshot(fetcher, pathname.split('?')[0]);
  const body = await render(pathname, snapshot);
  if (!html.includes('<div id="root"></div>')) throw new Error('Missing storefront mount');
  return html.replace('<div id="root"></div>', () =>
    `<div id="root">${body}</div><script id="public-storefront-data" type="application/json">${serializeStructuredData(snapshot)}</script>`);
}

import { API_ORIGIN } from './seo.mjs';
import { serializeStructuredData } from './structured.mjs';

export function needsCatalog(pathname) {
  return pathname === '/' || pathname === '/shop' || pathname === '/category'
    || /^\/(?:category|product)\/[^/]+\/?$/.test(pathname);
}

export function isPublicTemplate(pathname) {
  return needsCatalog(pathname) || ['/about', '/faq', '/contact', '/privacy', '/terms', '/returns', '/delivery-returns'].includes(pathname);
}

async function publicJson(endpoint, fetcher) {
  // No inbound cookies, authorization headers or user-controlled origins.
  const response = await fetcher(`${API_ORIGIN}/api/${endpoint}`, {
    signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Public ${endpoint} unavailable`);
  return response.json();
}

export async function loadPublicSnapshot(fetcher = fetch, pathname = '/') {
  const policies = ['/faq', '/returns', '/delivery-returns'].includes(pathname) || pathname.startsWith('/product/');
  const policyData = policies ? await Promise.all([
    publicJson('shipping-methods', fetcher),
    publicJson('return-information', fetcher),
  ]) : null;
  const extra = policyData ? {
    shippingMethods: policyData[0].shippingMethods,
    returnInformation: policyData[1].content,
  } : {};
  if (policyData && (!Array.isArray(extra.shippingMethods) || typeof extra.returnInformation !== 'string')) throw new Error('Public policies unavailable');
  // Informational pages do not depend on catalog availability. Their shared
  // navigation refreshes normally in the browser after hydration.
  if (!needsCatalog(pathname)) return {
    products: [], categories: [], homePage: null, inventory: {}, sales: {},
    catalogReady: false, ...extra,
  };
  const [catalog, stock, sales] = await Promise.all([
    publicJson('catalog', fetcher),
    publicJson('inventory', fetcher),
    publicJson('stripe/product-sales', fetcher),
  ]);
  if (!catalog.initialized || !Array.isArray(catalog.products) || !Array.isArray(catalog.categories)
    || !stock.inventory || !sales.sales) throw new Error('Public catalog unavailable');
  // Deliberately select the public payload instead of serializing an entire response.
  return {
    products: catalog.products.filter(product => product.status === 'Published'),
    categories: catalog.categories, homePage: catalog.homePage ?? null,
    inventory: stock.inventory, sales: sales.sales, ...extra,
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

// Run after the production build: node --test server/public-ssr.integration.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../dist/server/entry-server.js';
import { createSeoServer } from './index.mjs';

const categories = [{ id: 50, name: 'Dresses', slug: 'stable-dresses', description: 'Current collection', image: '/objects/category.webp' }];
const simple = {
  id: 9001, name: 'Live cotton dress', slug: 'live-cotton', category: 'Dresses',
  status: 'Published', type: 'Simple', price: '£27.25', stock: 7,
  image: '/objects/cotton.webp', galleryImages: [], position: '50% 50%',
  description: 'Actual public description', sku: 'LIVE', variations: [],
  longDescription: '<p>Detailed cotton <strong>description</strong><img src=x onerror=alert(1)><script>alert(1)</script></p>',
};
const variable = {
  ...simple, id: 9002, name: 'Variable evening dress', slug: 'variable-evening',
  type: 'Variable', price: '£999.00',
  variations: [
    { id: 20, size: 'S', colour: '', price: '£35.25', stock: 5, sku: 'S' },
    { id: 21, size: 'M', colour: '', price: '£39.75', stock: 3, sku: 'M' },
  ],
};
const snapshot = { products: [simple, variable], categories, homePage: null, inventory: { 9001: 0, '9002:20': 0, '9002:21': 2 }, sales: { 9002: 8 } };

test('real React templates produce visible public HTML with live stock and variant prices', () => {
  for (const route of ['/', '/shop', '/category', '/category/stable-dresses', '/product/live-cotton', '/product/variable-evening']) {
    const html = render(route, snapshot);
    assert.match(html, /<header/);
    assert.match(html, /<main/);
    assert.match(html, /<h1/);
    assert.match(html, /<footer/);
    assert.doesNotMatch(html, /file:\/\/|Loading the collection|£999\.00|£35\.25|onerror=/);
    if (route !== '/category') assert.match(html, /Live cotton dress|Variable evening dress/);
    if (route === '/shop') assert.match(html, /£39\.75/);
    if (route === '/product/live-cotton') {
      assert.match(html, /Actual public description/);
      assert.match(html, /This product is currently out of stock/);
    }
  }
});

test('query routes use the same search, sorting and pagination logic', () => {
  const html = render('/shop?search=Variable&sort=price-asc', snapshot);
  assert.match(html, /Variable evening dress/);
  assert.doesNotMatch(html, /data-testid="link-product-live-cotton"/);
  assert.match(html, /£39\.75/);
});

test('render state is restored between requests, including empty curated homepages', () => {
  render('/shop', snapshot);
  const empty = { ...snapshot, products: [], categories: [], homePage: { categoryIds: [], obsessionIds: [], momentIds: [] }, inventory: {}, sales: {} };
  const html = render('/', empty);
  assert.match(html, /No products are available right now/);
  assert.doesNotMatch(html, /Live cotton dress|Variable evening dress/);
  assert.match(render('/shop', snapshot), /Live cotton dress/);
});

test('production documents render for people and crawlers; redirects and private routes bypass public snapshots', async (t) => {
  let failStock = false;
  let publicLoads = 0;
  const fetcher = async (url, options) => {
    assert.deepEqual(options.headers, { accept: 'application/json' });
    const target = new URL(url);
    if (target.pathname === '/api/seo/resolve') {
      const path = target.searchParams.get('path');
      if (path === '/product/old-cotton') return Response.json({ status: 301, location: '/product/live-cotton' });
      if (path === '/product/missing') return Response.json({ status: 404, title: 'Not found' });
      return Response.json({ status: 200, title: 'Current public page', canonicalUrl: 'https://example.test/shop' });
    }
    publicLoads++;
    if (target.pathname === '/api/catalog') return Response.json({ ...snapshot, initialized: true });
    if (target.pathname === '/api/inventory') return failStock
      ? new Response('Unavailable', { status: 503 }) : Response.json({ inventory: snapshot.inventory });
    if (target.pathname === '/api/stripe/product-sales') return Response.json({ sales: snapshot.sales });
    if (target.pathname === '/api/shipping-methods') return Response.json({ shippingMethods: [
      { id: 'live', name: 'Merchant delivery', description: 'Current dispatch terms', price: 725, freeOver: null, enabled: true, sortOrder: 0 },
    ] });
    if (target.pathname === '/api/return-information') return Response.json({ content: '<p>Merchant return terms.</p>' });
    throw new Error(`Unexpected request ${url}`);
  };
  const server = createSeoServer({ fetcher, render });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/shop`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  assert.match(html, /<h1>Pieces with presence\.<\/h1>/);
  assert.match(html, /Current public page/);
  const stylesheet = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
  assert.ok(stylesheet, 'CSS must load without executing JavaScript');
  const css = await fetch(origin + stylesheet);
  assert.equal(css.status, 200);
  assert.match(await css.text(), /\.site-header/);
  assert.match(html, /id="public-storefront-data"/);
  assert.match(html, /£39\.75/);
  const crawler = await fetch(`${origin}/shop`, { headers: { 'user-agent': 'Googlebot', cookie: 'private=must-not-appear' } });
  assert.equal(await crawler.text(), html);
  const head = await fetch(`${origin}/shop`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), response.headers.get('content-length'));
  assert.equal(await head.text(), '');
  publicLoads = 0;
  const redirect = await fetch(`${origin}/product/old-cotton`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/product/live-cotton');
  assert.equal((await fetch(`${origin}/product/missing`)).status, 404);
  for (const route of ['/cart', '/checkout', '/account', '/wishlist', '/admin', '/order-confirmation']) {
    assert.doesNotMatch(await (await fetch(origin + route)).text(), /public-storefront-data|Live cotton dress/);
  }
  assert.equal(publicLoads, 0);
  for (const route of ['/about', '/faq', '/contact', '/privacy', '/terms', '/returns', '/delivery-returns']) {
    publicLoads = 0;
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    const html = await response.text();
    assert.match(html, /<main/);
    assert.match(html, /<h1[\s>]/, route);
    assert.match(html, /id="public-storefront-data"/);
    assert.doesNotMatch(html, /Live cotton dress|Loading the collection/);
    const policyPage = ['/faq', '/returns', '/delivery-returns'].includes(route);
    assert.equal(publicLoads, policyPage ? 2 : 0, 'Informational pages must not fetch catalog or inventory');
    if (policyPage) {
      assert.match(html, /Merchant delivery/);
      assert.match(html, /£7\.25/);
      assert.match(html, /Merchant return terms/);
      assert.doesNotMatch(html, /Loading delivery information|Loading return information/);
    }
  }
  assert.doesNotMatch(await (await fetch(`${origin}/sitemap.xml`)).text(), /<url>|<loc>/);
  failStock = true;
  const failure = await fetch(`${origin}/shop`);
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get('cache-control'), 'no-store');
  const failureHtml = await failure.text();
  assert.match(failureHtml, /Storefront temporarily unavailable/);
  assert.doesNotMatch(failureHtml, /public-storefront-data|£39\.75/);
});

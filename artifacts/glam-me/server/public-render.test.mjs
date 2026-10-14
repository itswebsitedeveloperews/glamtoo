import test from 'node:test';
import assert from 'node:assert/strict';
import { injectPublicBody, isPublicTemplate, loadPublicSnapshot } from './public-render.mjs';

const shell = '<html><head></head><body><div id="root"></div></body></html>';
const product = { id: 1, name: '</script><script>alert(1)</script>', status: 'Published' };
function fixture(url, options) {
  assert.deepEqual(options.headers, { accept: 'application/json' });
  assert.ok(options.signal);
  const endpoint = new URL(url).pathname;
  if (endpoint === '/api/catalog') return Promise.resolve(Response.json({
    initialized: true, products: [product, { id: 2, status: 'Draft' }],
    categories: [], homePage: { categoryIds: [], obsessionIds: [], momentIds: [] },
    privateAccount: 'must-not-serialize',
  }));
  if (endpoint === '/api/inventory') return Promise.resolve(Response.json({ inventory: { 1: 0 } }));
  if (endpoint === '/api/stripe/product-sales') return Promise.resolve(Response.json({ sales: { 1: 9 } }));
  throw new Error(`Unexpected endpoint ${endpoint}`);
}

test('only public templates are rendered, never account, bag or checkout', async () => {
  for (const path of ['/', '/shop', '/category', '/category/dresses', '/product/stable-slug', '/product/stable-slug/',
    '/about', '/faq', '/contact', '/privacy', '/terms', '/returns', '/delivery-returns']) assert.ok(isPublicTemplate(path));
  for (const path of ['/account', '/admin', '/cart', '/checkout', '/wishlist', '/order-confirmation', '/product/x/private']) {
    assert.equal(isPublicTemplate(path), false);
    assert.equal(await injectPublicBody(shell, path, { fetcher: () => { throw new Error('No fetch allowed'); } }), shell);
  }
});

test('informational pages skip catalog data and policies come from public settings', async () => {
  for (const route of ['/about', '/contact', '/privacy', '/terms']) {
    const snapshot = await loadPublicSnapshot(() => { throw new Error('No catalog fetch allowed'); }, route);
    assert.equal(snapshot.catalogReady, false);
    assert.deepEqual(snapshot.products, []);
  }
  for (const route of ['/faq', '/returns', '/delivery-returns']) {
    const snapshot = await loadPublicSnapshot(async (url) => {
      if (url.endsWith('/shipping-methods')) return Response.json({ shippingMethods: [] });
      if (url.endsWith('/return-information')) return Response.json({ content: '<p>Merchant return terms</p>' });
      throw new Error('Catalog must not be required for policies');
    }, route);
    assert.equal(snapshot.returnInformation, '<p>Merchant return terms</p>');
    assert.deepEqual(snapshot.shippingMethods, []);
    assert.equal(snapshot.catalogReady, false);
  }
});

test('one public snapshot supplies rendering and safe hydration JSON', async () => {
  const body = await injectPublicBody(shell, '/shop?sort=bestsellers&page=2', {
    fetcher: fixture,
    render(path, snapshot) {
      assert.equal(path, '/shop?sort=bestsellers&page=2');
      assert.deepEqual(snapshot.products, [product]);
      assert.equal(snapshot.inventory[1], 0);
      assert.equal(snapshot.sales[1], 9);
      assert.deepEqual(snapshot.homePage, { categoryIds: [], obsessionIds: [], momentIds: [] });
      return '<main><h1>The actual shop</h1></main>';
    },
  });
  assert.match(body, /<div id="root"><main><h1>The actual shop/);
  assert.doesNotMatch(body, /must-not-serialize|<script>alert/);
  const json = body.match(/id="public-storefront-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).products[0].name, product.name);
});

test('unverified stock, uninitialized catalog and failed data never advertise a false catalog', async () => {
  for (const endpoint of ['/api/catalog', '/api/inventory', '/api/stripe/product-sales']) {
    await assert.rejects(loadPublicSnapshot((url, options) => new URL(url).pathname === endpoint
      ? Promise.resolve(new Response('Unavailable', { status: 503 })) : fixture(url, options)));
  }
  await assert.rejects(loadPublicSnapshot((url, options) => new URL(url).pathname === '/api/catalog'
    ? Promise.resolve(Response.json({ initialized: false, products: [], categories: [] })) : fixture(url, options)));
});

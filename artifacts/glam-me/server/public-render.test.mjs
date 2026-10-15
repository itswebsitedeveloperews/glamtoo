import test from 'node:test';
import assert from 'node:assert/strict';
import { injectPublicBody, isPublicTemplate, loadPublicSnapshot } from './public-render.mjs';

const shell = '<html><head></head><body><div id="root"></div></body></html>';
const product = { id: 1, name: '</script><script>alert(1)</script>', status: 'Published' };
function fixture(url, options) {
  assert.deepEqual(options.headers, { accept: 'application/json' });
  assert.ok(options.signal);
  const endpoint = new URL(url).pathname;
  if (endpoint === '/api/announcements') return Promise.resolve(Response.json({ announcements: [] }));
  if (endpoint === '/api/hero-slides') return Promise.resolve(Response.json({ slides: [] }));
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
    const snapshot = await loadPublicSnapshot((url) => {
      assert.ok(url.endsWith('/announcements'), 'No catalog fetch allowed');
      return Response.json({ announcements: [] });
    }, route);
    assert.equal(snapshot.catalogReady, false);
    assert.deepEqual(snapshot.products, []);
  }
  for (const route of ['/faq', '/returns', '/delivery-returns']) {
    const snapshot = await loadPublicSnapshot(async (url) => {
      if (url.endsWith('/announcements')) return Response.json({ announcements: [] });
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

const review = {
  id: 101, productId: 1, rating: 5, title: 'Lovely </script> fit',
  body: 'Comfortable and well made.', displayName: 'Shopper',
  createdAt: '2026-10-15T23:30:00.000Z', verifiedPurchase: true,
};
const reviewPage = { reviews: [review], averageRating: 5, total: 1, page: 1, pageSize: 10 };
function productFixture(reviewsHandler = () => Response.json(reviewPage)) {
  return (url, options) => {
    const endpoint = new URL(url).pathname;
    if (endpoint === '/api/catalog') return Promise.resolve(Response.json({
      initialized: true, products: [{ ...product, slug: 'test-product' }], categories: [],
    }));
    if (endpoint === '/api/shipping-methods') return Promise.resolve(Response.json({ shippingMethods: [] }));
    if (endpoint === '/api/return-information') return Promise.resolve(Response.json({ content: '<p>Return policy</p>' }));
    if (endpoint === '/api/products/1/reviews') {
      assert.equal(new URL(url).searchParams.get('page'), '1');
      assert.deepEqual(options.headers, { accept: 'application/json' });
      return Promise.resolve(reviewsHandler(options));
    }
    return fixture(url, options);
  };
}

test('product HTML and hydration share approved public reviews without account or order fields', async () => {
  const fetcher = productFixture(() => Response.json({
    ...reviewPage, privateEmail: 'review-private@example.test',
    reviews: [{ ...review, userId: 'private-customer-id', orderId: 'private-order-id', email: 'review-private@example.test' }],
  }));
  const html = await injectPublicBody(shell, '/product/test-product', {
    fetcher,
    render(_path, snapshot) {
      assert.deepEqual(snapshot.productReviews, { productId: 1, data: reviewPage });
      return '<main>Product with reviews ready before JavaScript</main>';
    },
  });
  assert.match(html, /reviews ready before JavaScript/);
  assert.doesNotMatch(html, /private-customer-id|private-order-id|review-private@example|Lovely <\/script>/);
  const data = JSON.parse(html.match(/id="public-storefront-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.productReviews.data, reviewPage);
});

test('review failures never fail the product document or pretend an unavailable collection is empty', async () => {
  for (const response of [
    () => new Response('Unavailable', { status: 503 }),
    () => Response.json({ ...reviewPage, averageRating: 99 }),
    () => Response.json({ ...reviewPage, reviews: [{ ...review, verifiedPurchase: false }] }),
  ]) {
    const snapshot = await loadPublicSnapshot(productFixture(response), '/product/test-product');
    assert.equal(snapshot.products[0].id, 1);
    assert.deepEqual(snapshot.productReviews, { productId: 1, unavailable: true });
  }
  const empty = await loadPublicSnapshot(productFixture(() => Response.json({
    reviews: [], averageRating: 0, total: 0, page: 1, pageSize: 10,
  })), '/product/1');
  assert.equal(empty.productReviews.data.total, 0);
  assert.equal(empty.productReviews.unavailable, undefined);
});

test('catalogue, inventory and sales start while product policies are still loading', async () => {
  const started = [];
  let releasePolicy;
  const policy = new Promise(resolve => { releasePolicy = resolve; });
  const base = productFixture();
  const snapshotPromise = loadPublicSnapshot((url, options) => {
    const endpoint = new URL(url).pathname;
    started.push(endpoint);
    if (endpoint === '/api/shipping-methods') return policy;
    return base(url, options);
  }, '/product/test-product');
  for (const path of ['/api/catalog', '/api/inventory', '/api/stripe/product-sales']) assert.ok(started.includes(path), path);
  releasePolicy(Response.json({ shippingMethods: [] }));
  assert.equal((await snapshotPromise).productReviews.data.total, 1);
});

test('a stalled review endpoint has a short deadline without failing the catalogue', async () => {
  const keepAlive = setTimeout(() => {}, 2000);
  let reviewSignal;
  try {
    const snapshot = await loadPublicSnapshot(productFixture(({ signal }) => {
      reviewSignal = signal;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }), '/product/test-product');
    assert.equal(reviewSignal.aborted, true);
    assert.deepEqual(snapshot.productReviews, { productId: 1, unavailable: true });
    assert.equal(snapshot.products[0].id, 1);
  } finally { clearTimeout(keepAlive); }
});

test('public snapshots include only enabled announcement fields and tolerate an unavailable bar', async () => {
  const announcement = { id: 1, text: 'Latest pieces', link: '/shop', displayOrder: 0, enabled: true, revision: 1 };
  const snapshot = await loadPublicSnapshot((url, options) => new URL(url).pathname === '/api/announcements'
    ? Promise.resolve(Response.json({ announcements: [
      { ...announcement, internalNote: 'not-public' }, { ...announcement, id: 2, enabled: false },
    ] })) : fixture(url, options));
  assert.deepEqual(snapshot.announcements, [announcement]);
  const unavailable = await loadPublicSnapshot((url, options) => new URL(url).pathname === '/api/announcements'
    ? Promise.resolve(new Response('Unavailable', { status: 503 })) : fixture(url, options));
  assert.equal(unavailable.announcements, undefined);
  assert.equal(unavailable.products[0].id, product.id);
});

// Run after the production build: node --test server/public-ssr.integration.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { render } from '../dist/server/entry-server.js';
import { createSeoServer } from './index.mjs';

import { snapshot, fixtureResponse } from './public-ssr.fixtures.mjs';

test('production renderer works without workspace node_modules', async (t) => {
  const isolated = await mkdtemp(path.join(tmpdir(), 'glam-ssr-runtime-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  await cp(new URL('../dist/server/', import.meta.url), isolated, { recursive: true });
  const entry = pathToFileURL(path.join(isolated, 'entry-server.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { render } from ${JSON.stringify(entry)};
    const snapshot = ${JSON.stringify(snapshot)};
    for (const route of ['/', '/shop', '/product/live-cotton', '/about', '/faq']) {
      const html = render(route, snapshot);
      if (!html.includes('<main') || !html.includes('<h1')) throw new Error('Missing public HTML: ' + route);
    }
  `], { cwd: isolated, env: { PATH: process.env.PATH, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

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
  const renderErrors = [];
  const fetcher = async (url, options) => {
    assert.deepEqual(options.headers, { accept: 'application/json' });
    const target = new URL(url);
    if (target.pathname !== '/api/seo/resolve') publicLoads++;
    if (target.pathname === '/api/inventory' && failStock) return new Response('Unavailable', { status: 503 });
    return fixtureResponse(url, options);
  };
  const server = createSeoServer({ fetcher, render, onRenderError: (error, pathname) => renderErrors.push({ error, pathname }) });
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
  assert.equal(renderErrors.length, 1);
  assert.equal(renderErrors[0].pathname, '/shop');
  assert.match(renderErrors[0].error.message, /Public inventory unavailable/);
});

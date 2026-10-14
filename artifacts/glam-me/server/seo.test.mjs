import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSeoServer } from './index.mjs';
import { injectSeo, parseRequestUrl, isDocumentPath, proxySeoFile } from './seo.mjs';
import { storefrontHeaders, FRAME_POLICY } from './security.mjs';

test('Vite runtime modules bypass document SEO routing', () => {
  for (const pathname of ['/@react-refresh', '/@vite/client', '/@id/virtual-module', '/src/main.tsx']) {
    assert.equal(isDocumentPath(pathname), false);
  }
  assert.equal(isDocumentPath('/product/a-dress'), true);
  assert.equal(isDocumentPath('/index.html'), true);
  assert.equal(isDocumentPath('/missing.html'), true);
  assert.equal(isDocumentPath('/api'), false);
  assert.equal(isDocumentPath('/api/seo/resolve'), false);
});

test('HTML metadata is escaped and does not duplicate the static fallback', () => {
  const html = '<html><head><title>Fallback</title><meta name="robots" content="noindex" data-route-seo /></head><body></body></html>';
  const result = injectSeo(html, {
    title: '<script>alert("x")</script>',
    description: 'a" onload="evil & <b>',
    canonicalUrl: 'https://example.org/?x="&y=<',
    robots: 'index, follow',
    type: 'product',
    image: 'https://example.org/image?x="',
  });
  assert.match(result, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(result, /<script>/);
  assert.match(result, /a&quot; onload=&quot;evil &amp; &lt;b&gt;/);
  assert.match(result, /og:type" content="product"/);
  assert.equal((result.match(/name="robots"/g) || []).length, 1);
  assert.match(result, /name="robots" content="noindex, follow"/);
});

test('structured JSON is safely serialized and removed along with stale social metadata', () => {
  const data = { type: 'product', image: 'https://example.org/a.jpg',
    structuredData: { '@type': 'Product', name: '</script><script>alert(1)</script>&\u2028' } };
  const product = injectSeo('<head><title>Old</title></head>', data);
  const json = product.match(/type="application\/ld\+json" data-route-seo>(.*?)<\/script>/s)[1];
  assert.deepEqual(JSON.parse(json), data.structuredData);
  assert.doesNotMatch(json, /<\/script>|&|\u2028/);
  const next = injectSeo(product, { type: 'website' });
  assert.doesNotMatch(next, /application\/ld\+json|og:image|twitter:image/);
  assert.equal((injectSeo(product, data).match(/application\/ld\+json/g) || []).length, 1);
});

test('complete integration policy is enforced without unsafe production scripts', () => {
  const headers = storefrontHeaders({ html: '<script type="application/ld+json">{}</script>' });
  assert.ok(headers['Content-Security-Policy'].includes(FRAME_POLICY));
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  const policy = headers['Content-Security-Policy'];
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
  for (const dependency of ['https://js.stripe.com', 'https://api.stripe.com', 'https://hooks.stripe.com',
    'https://*.js.stripe.com', 'https://*.protect.clerk.com:*', 'https://challenges.cloudflare.com',
    'https://clerk.glamtoo.webdesignessex.io', 'https://storage.googleapis.com',
    "object-src 'none'", "'sha256-"]) assert.ok(policy.includes(dependency), dependency);
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(!policy.match(/script-src[^;]*'unsafe-inline'/));
  assert.ok(!policy.includes('fonts.googleapis.com'));
  assert.ok(!policy.includes('fonts.gstatic.com'));
  assert.ok(!policy.includes('https://*.clerk.com'));
  assert.ok(storefrontHeaders({ development: true })['Content-Security-Policy'].includes('ws: wss:'));
});

test('malformed and traversal paths are rejected', () => {
  for (const url of ['/../secret', '/%2e%2e/secret', '/%2fetc', '/%5csecret', '/bad%', '/%E0%A4%A', '//evil', '/a\\b']) {
    assert.throws(() => parseRequestUrl(url), url);
  }
});

test('safe discovery does not depend on API availability or stale sitemap data', async () => {
  const unavailable = () => { throw new Error('API must not be needed'); };
  const xml = await proxySeoFile('/sitemap.xml', unavailable);
  assert.equal(xml.status, 200);
  assert.match(new TextDecoder().decode(xml.body), /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"><\/urlset>/);
  assert.doesNotMatch(new TextDecoder().decode(xml.body), /<url>|<loc>/);
  const robots = await proxySeoFile('/robots.txt', unavailable);
  assert.equal(new TextDecoder().decode(robots.body), 'User-agent: *\nAllow: /\nDisallow: /api/\n');
});

test('HTTP status, HEAD, static files, error response and dynamic feeds', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'glam-seo-'));
  await writeFile(path.join(directory, 'index.html'), '<html><head><title>Fallback</title></head><body>App shell</body></html>');
  await writeFile(path.join(directory, 'icon.svg'), '<svg/>');
  const resolvedPaths = [];
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/seo/robots.txt') return new Response('User-agent: *\nAllow: /');
    if (parsed.pathname === '/api/seo/sitemap.xml') return new Response('<urlset/>');
    const target = parsed.searchParams.get('path');
    resolvedPaths.push(target);
    if (target === '/broken') throw new Error('backend unavailable');
    if (target === '/old') return Response.json({ status: 301, location: '/new' });
    if (target === '/missing') return Response.json({ status: 404, title: 'Not found', robots: 'index, follow' }, { status: 404 });
    return Response.json({ status: target === '/missing' ? 404 : 200, title: 'Category', description: 'Products', canonicalUrl: 'https://glamtoo.webdesignessex.io/shop', robots: 'index, follow', type: 'website' });
  };
  const seoFetcher = async (url, options) => {
    const endpoint = new URL(url).pathname;
    if (endpoint === '/api/catalog') return Response.json({ initialized: true, products: [], categories: [] });
    if (endpoint === '/api/inventory') return Response.json({ inventory: {} });
    if (endpoint === '/api/stripe/product-sales') return Response.json({ sales: {} });
    return fetcher(url, options);
  };
  // Exercise document plumbing without depending on the compiled React bundle.
  await writeFile(path.join(directory, 'index.html'), '<html><head><title>Fallback</title></head><body>App shell<div id="root"></div></body></html>');
  const server = createSeoServer({ directory, fetcher: seoFetcher, render: () => '<main>Public collection</main>' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/shop?page=2`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title data-route-seo>Category<\/title>/);
  assert.ok(resolvedPaths.includes('/shop?page=2'));
  assert.equal((await fetch(`${base}/old`, { redirect: 'manual' })).headers.get('location'), '/new');
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.match(missingHtml, /App shell/);
   assert.match(missingHtml, /noindex, nofollow/);
  const broken = await fetch(`${base}/broken`);
  assert.equal(broken.status, 503);
  assert.equal(broken.headers.get('cache-control'), 'no-store');
   assert.match(await broken.text(), /noindex, follow/);
  assert.equal((await fetch(`${base}/__health`)).status, 200);
  const head = await fetch(`${base}/icon.svg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'image/svg+xml');
  assert.equal(head.headers.get('content-length'), '6');
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/nonexistent.png`)).status, 404);
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
  const xml = await sitemap.text();
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"><\/urlset>/);
  assert.doesNotMatch(xml, /<url>|<loc>/);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Allow: \//);
  for (const method of ['GET', 'HEAD']) {
    for (const route of ['/shop?page=2', '/', '/index.html', '/missing.html', '/missing', '/old', '/broken',
      '/robots.txt', '/sitemap.xml', '/nonexistent.png', '/bad%']) {
      const response = await fetch(`${base}${route}`, { method, redirect: 'manual' });
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', `${method} ${route}`);
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.ok(response.headers.get('content-security-policy').includes(FRAME_POLICY));
      assert.ok(response.headers.get('content-security-policy').includes("default-src 'self'"));
      assert.equal(response.headers.get('content-security-policy-report-only'), null);
      const body = await response.text();
      if (method === 'HEAD') assert.equal(body, '');
      else if (response.headers.get('content-type')?.includes('text/html')) {
        assert.match(body, /name="robots" content="noindex, (?:follow|nofollow)"/);
        assert.doesNotMatch(body, /content="index, follow"/);
      }
    }
  }
  assert.ok(resolvedPaths.includes('/'), 'direct index.html goes through the home resolver');
});
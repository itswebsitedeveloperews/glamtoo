import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSeoServer } from './index.mjs';
import { injectSeo, parseRequestUrl, isDocumentPath } from './seo.mjs';

test('Vite runtime modules bypass document SEO routing', () => {
  for (const pathname of ['/@react-refresh', '/@vite/client', '/@id/virtual-module', '/src/main.tsx']) {
    assert.equal(isDocumentPath(pathname), false);
  }
  assert.equal(isDocumentPath('/product/a-dress'), true);
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
});

test('malformed and traversal paths are rejected', () => {
  for (const url of ['/../secret', '/%2e%2e/secret', '/%2fetc', '/%5csecret', '/bad%', '/%E0%A4%A', '//evil', '/a\\b']) {
    assert.throws(() => parseRequestUrl(url), url);
  }
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
  const server = createSeoServer({ directory, fetcher });
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
  assert.match(await broken.text(), /noindex, nofollow/);
  assert.equal((await fetch(`${base}/__health`)).status, 200);
  const head = await fetch(`${base}/icon.svg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'image/svg+xml');
  assert.equal(head.headers.get('content-length'), '6');
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/nonexistent.png`)).status, 404);
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(await sitemap.text(), '<urlset/>');
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Allow: \//);
});
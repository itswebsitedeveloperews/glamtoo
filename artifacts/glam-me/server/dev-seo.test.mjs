import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { DEVELOPMENT_FRAME_POLICY } from './security.mjs';

test('development documents, HEAD, redirects and fallbacks get noindex without intercepting Vite', async (t) => {
  const originalFetch = globalThis.fetch;
  const previousPort = process.env.PORT;
  const previousBase = process.env.BASE_PATH;
  process.env.PORT = '18781';
  process.env.BASE_PATH = '/';
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'http://127.0.0.1:8080') return originalFetch(url, options);
    if (parsed.pathname.endsWith('robots.txt')) return new Response('User-agent: *\nAllow: /\nDisallow: /api/\n');
    if (parsed.pathname.endsWith('sitemap.xml')) return new Response('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    if (parsed.pathname === '/api/catalog') return Response.json({ initialized: true, products: [], categories: [], homePage: null });
    if (parsed.pathname === '/api/inventory') return Response.json({ inventory: {} });
    if (parsed.pathname === '/api/stripe/product-sales') return Response.json({ sales: {} });
    if (parsed.pathname === '/api/shipping-methods') return Response.json({ shippingMethods: [] });
    if (parsed.pathname === '/api/return-information') return Response.json({ content: '<p>Current return terms</p>' });
    const target = parsed.searchParams.get('path');
    if (target === '/broken') throw new Error('resolver unavailable');
    if (target === '/old') return Response.json({ status: 301, location: '/shop' });
    return Response.json({ status: target === '/missing' || target === '/missing.html' ? 404 : 200,
      title: target === '/' ? 'Home' : 'Shop', type: 'website', robots: 'index, follow',
      canonicalUrl: 'https://glamtoo.webdesignessex.io/shop' });
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let server;
  t.after(async () => {
    await server?.close();
    globalThis.fetch = originalFetch;
    if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
    if (previousBase === undefined) delete process.env.BASE_PATH; else process.env.BASE_PATH = previousBase;
  });
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'),
    server: { port: 0, strictPort: false, host: '127.0.0.1' }, logLevel: 'silent',
    // Public SSR still mounts Clerk. Use an invented key so this header test
    // also runs in the credential-stripped Linux validation environment.
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(`pk_test_${Buffer.from('seo-fixture.clerk.accounts.dev$').toString('base64')}`),
      'import.meta.env.VITE_CLERK_PROXY_URL': JSON.stringify(''),
    },
    // This HTTP/header test does not need dependency prebundling. Avoid racing
    // optimizer restarts while requesting Vite runtime modules in a clean tree.
    optimizeDeps: { noDiscovery: true, include: [] } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const method of ['GET', 'HEAD']) {
    for (const route of ['/', '/shop?page=2', '/index.html', '/missing', '/missing.html', '/old', '/broken', '/bad%', '/robots.txt', '/sitemap.xml']) {
      const response = await originalFetch(`${base}${route}`, { method, redirect: 'manual' });
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', `${method} ${route}`);
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
       assert.ok(response.headers.get('content-security-policy').includes(DEVELOPMENT_FRAME_POLICY));
       assert.ok(response.headers.get('content-security-policy').includes('ws: wss:'));
       assert.equal(response.headers.get('content-security-policy-report-only'), null);
      const body = await response.text();
      if (method === 'GET' && (route === '/' || route === '/shop?page=2')) {
        assert.match(body, /<link rel="stylesheet" href="\/src\/index\.css"[^>]*>/);
      }
      if (method === 'HEAD') assert.equal(body, '');
      else if (response.headers.get('content-type')?.includes('text/html')) {
        assert.equal((body.match(/name="robots"/g) || []).length, 1);
        assert.match(body, /name="robots" content="noindex, (?:follow|nofollow)"/);
      }
      if (route === '/index.html' && method === 'GET') assert.match(body, /<title data-route-seo>Home<\/title>/);
      if (route === '/old') { assert.equal(response.status, 301); assert.equal(response.headers.get('location'), '/shop'); }
      if (route === '/broken') assert.equal(response.status, 503);
      if (route === '/missing') assert.equal(response.status, 404);
    }
  }
  for (const route of ['/@vite/client', '/@react-refresh', '/src/main.tsx']) {
    const response = await originalFetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.ok(response.headers.get('content-type')?.includes('javascript'), route);
    assert.doesNotMatch(await response.text(), /<meta name="robots"/);
  }
  const media = await originalFetch(`${base}/social-home.webp`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/webp');
  server.transformIndexHtml = async () => { throw new Error('simulated HTML transformation failure'); };
  const errorDocument = await originalFetch(`${base}/shop`);
  assert.equal(errorDocument.status, 503);
  assert.equal(errorDocument.headers.get('x-robots-tag'), 'noindex, follow');
  assert.match(await errorDocument.text(), /name="robots" content="noindex, follow"/);
  const errorHead = await originalFetch(`${base}/shop`, { method: 'HEAD' });
  assert.equal(errorHead.status, 503);
  assert.equal(await errorHead.text(), '');
});

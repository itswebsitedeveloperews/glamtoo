import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FALLBACK, injectSeo, isDocumentPath, parseRequestUrl, proxySeoFile, resolveSeo } from './seo.mjs';
import { storefrontHeaders } from './security.mjs';
import { compressAsset } from './asset-compression.mjs';
import { injectPublicBody } from './public-render.mjs';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/public');
const mime = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

function send(res, method, status, body, headers = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Length': bytes.length, ...storefrontHeaders({
    html: headers['Content-Type']?.startsWith('text/html') ? bytes.toString() : '',
  }), ...headers });
  res.end(method === 'HEAD' ? undefined : bytes);
}

export function createSeoServer({ directory = dist, fetcher = fetch, render = async (...args) => {
  const entry = await import('../dist/server/entry-server.js');
  return entry.render(...args);
} } = {}) {
  return createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, method, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let url;
    try { url = parseRequestUrl(req.url); } catch {
      send(res, method, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    const { pathname, search } = url;
    if (pathname === '/__health') {
      send(res, method, 200, 'OK', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return;
    }
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml') {
      try {
        const result = await proxySeoFile(pathname, fetcher);
        send(res, method, result.status, Buffer.from(result.body), { 'Content-Type': result.contentType, 'Cache-Control': 'no-cache' });
      } catch {
        send(res, method, 503, 'SEO service unavailable', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      return;
    }
    if (pathname.startsWith('/api/')) {
      send(res, method, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    if (isDocumentPath(pathname)) {
      try {
        const data = await resolveSeo((pathname === '/index.html' ? '/' : pathname) + search, fetcher);
        if (data.status === 301) {
          send(res, method, 301, '', { Location: data.location, 'Cache-Control': 'no-cache' });
          return;
        }
        let html = await readFile(path.join(directory, 'index.html'), 'utf8');
        if (pathname === '/' || pathname === '/index.html') {
          try {
            const preload = JSON.parse(await readFile(path.join(directory, 'home-hero-preload.json'), 'utf8'));
            const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            html = html.replace('</head>', `<link rel="preload" as="image" href="${escape(preload.href)}" imagesrcset="${escape(preload.srcSet)}" imagesizes="${escape(preload.sizes)}" fetchpriority="high"></head>`);
          } catch {
            // Older/test builds have no generated preload; the normal image still loads.
          }
        }
        if (data.status === 200) html = await injectPublicBody(html, (pathname === '/index.html' ? '/' : pathname) + search, { fetcher, render });
        send(res, method, data.status, injectSeo(html, data.status === 404 ? { ...data, robots: 'noindex, nofollow' } : data), {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
        });
      } catch {
        try {
          const html = (await readFile(path.join(directory, 'index.html'), 'utf8'))
            .replace('<div id="root"></div>', '<div id="root"><main><h1>Storefront temporarily unavailable</h1><p>Current products and prices could not be loaded. Please try again shortly.</p></main></div>');
          send(res, method, 503, injectSeo(html, FALLBACK), {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          });
        } catch {
          send(res, method, 503, 'Service unavailable', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        }
      }
      return;
    }
    // resolve beneath the dist root, never follow symlinks outside it.
    const file = path.resolve(directory, `.${pathname}`);
    try {
      if (!file.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Invalid asset path');
      const real = await realpath(file);
      if (!real.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Invalid asset path');
      const info = await stat(real);
      if (!info.isFile()) throw new Error('Not a file');
      const contentType = mime[path.extname(real).toLowerCase()] || 'application/octet-stream';
      const asset = await compressAsset(await readFile(real), contentType, req.headers['accept-encoding'], `${real}:${info.mtimeMs}:${info.size}`);
      send(res, method, 200, asset.body, {
        'Content-Type': contentType,
        ...asset.headers,
        'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      });
    } catch {
      send(res, method, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  createSeoServer().listen(port, '0.0.0.0');
}
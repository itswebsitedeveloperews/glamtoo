import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { FALLBACK, injectSeo, isDocumentPath, parseRequestUrl, proxySeoFile, resolveSeo } from './server/seo.mjs';
import { storefrontHeaders } from './server/security.mjs';
import { responsiveImages } from './build/responsive-images';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { injectPublicBody } from './server/public-render.mjs';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'route-seo-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          let url;
          try { url = parseRequestUrl(req.url); } catch {
            Object.entries(storefrontHeaders({ development: true })).forEach(([key, value]) => res.setHeader(key, value));
            res.statusCode = 400;
            res.end(req.method === 'HEAD' ? undefined : 'Bad Request');
            return;
          }
          const { pathname, search } = url;
          // Do not interfere with API, Vite modules or assets. Documents, feeds,
          // direct HTML and their redirects/errors get the same protections.
          if (isDocumentPath(pathname) || pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml') {
            Object.entries(storefrontHeaders({ development: true })).forEach(([key, value]) => res.setHeader(key, value));
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          if (pathname === '/__health') {
            res.statusCode = 200;
            res.setHeader('Content-Length', 2);
            res.end(req.method === 'HEAD' ? undefined : 'OK');
            return;
          }
          if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml') {
            try {
              const result = await proxySeoFile(pathname);
              res.statusCode = result.status;
              res.setHeader('Content-Type', result.contentType);
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Content-Length', result.body.byteLength);
              res.end(req.method === 'HEAD' ? undefined : Buffer.from(result.body));
            } catch {
              res.statusCode = 503;
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Content-Length', Buffer.byteLength('SEO service unavailable'));
              res.end(req.method === 'HEAD' ? undefined : 'SEO service unavailable');
            }
            return;
          }
          if (!isDocumentPath(pathname)) return next();
          let data = FALLBACK;
          let status = 503;
          try {
            const resolved = await resolveSeo((pathname === '/index.html' ? '/' : pathname) + search);
            if (resolved.status === 301) {
              res.statusCode = 301;
              res.setHeader('Location', resolved.location!);
              res.setHeader('Cache-Control', 'no-cache');
              res.end();
              return;
            }
            data = resolved;
            status = resolved.status;
          } catch {
            res.setHeader('Cache-Control', 'no-store');
          }
          try {
            const html = await readFile(path.resolve(import.meta.dirname, 'index.html'), 'utf8');
            const transformed = await server.transformIndexHtml(req.url || '/', html, req.originalUrl);
            const rendered = status === 200 ? await injectPublicBody(transformed, (pathname === '/index.html' ? '/' : pathname) + search, {
              render: async (path, snapshot) => (await server.ssrLoadModule('/src/entry-server.tsx')).render(path, snapshot),
            }) : transformed;
            const body = injectSeo(rendered, status === 404 ? { ...data, robots: 'noindex, nofollow' } : data);
            res.statusCode = status;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', status === 503 ? 'no-store' : 'no-cache');
            res.setHeader('Content-Length', Buffer.byteLength(body));
            res.end(req.method === 'HEAD' ? undefined : body);
          } catch (error) {
            server.config.logger.error(error instanceof Error ? error.stack || error.message : String(error));
            const body = injectSeo('<!doctype html><html lang="en"><head></head><body>Service unavailable</body></html>', FALLBACK);
            res.statusCode = 503;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Length', Buffer.byteLength(body));
            res.end(req.method === 'HEAD' ? undefined : body);
          }
        });
      },
    },
    react(),
    responsiveImages(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  // The production server loads this bundle outside Vite. Include its runtime
  // dependencies so rendering does not rely on development node_modules.
  ssr: {
    noExternal: process.env.STOREFRONT_SSR ? true : undefined,
  },
  build: {
    outDir: path.resolve(import.meta.dirname, process.env.STOREFRONT_SSR ? 'dist/server' : 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

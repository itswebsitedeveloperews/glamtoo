// Test-only server. Never connects to the real API, database, Clerk or Stripe.
import { createServer } from 'node:http';
import { fixtureResponse } from '../server/public-ssr.fixtures.mjs';

const mode = process.argv[2];
if (!['development', 'production'].includes(mode)) throw new Error('Expected development or production');
const port = Number(process.env.SSR_BROWSER_PORT || (mode === 'development' ? 18782 : 18783));
process.env.PORT = String(port);
process.env.BASE_PATH = '/';
// Public hydration does not need auth. Do not send real credentials to browsers.
process.env.VITE_CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('ssr-fixture.clerk.accounts.dev$').toString('base64')}`;
process.env.VITE_CLERK_PROXY_URL = '';
delete process.env.REPL_ID; // No workspace-only dev banner in the isolated harness.

// Dev's SSR middleware uses fetch directly; scope this replacement to this test
// process and fail closed for every unexpected upstream request.
globalThis.fetch = async (url, options) => fixtureResponse(String(url), options);
let vite;
let production;
if (mode === 'development') {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    configFile: new URL('../vite.config.ts', import.meta.url).pathname,
    server: { middlewareMode: true, hmr: false },
  });
} else {
  const { createSeoServer } = await import('../server/index.mjs');
  production = createSeoServer({ fetcher: globalThis.fetch });
}

// Use real HTTP image responses, not data URLs; production and dev CSS/assets
// are served unchanged by their own servers.
const { default: sharp } = await import('sharp');
const image = await sharp({
  create: { width: 160, height: 200, channels: 3, background: '#e8adc1' },
}).webp().toBuffer();
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) throw new Error(`Write forbidden: ${req.method}`);
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (/^\/(?:api\/storage\/)?objects\/(?:category|cotton)\.webp$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      res.end(req.method === 'HEAD' ? undefined : image);
    } else if (url.pathname.startsWith('/api/')) {
      const result = fixtureResponse(url.href, { method: req.method });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
    } else if (vite) {
      vite.middlewares(req, res);
    } else {
      production.emit('request', req, res);
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Unexpected test request');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`SSR ${mode} ready on ${port}`));
async function close() {
  await vite?.close();
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', close);
process.on('SIGINT', close);

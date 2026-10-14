import { createHash } from 'node:crypto';

export const NOINDEX = 'noindex, follow';
export const FRAME_POLICY = "frame-ancestors 'self'";
// Development must permit the workspace preview; production needs no such exception.
export const DEVELOPMENT_FRAME_POLICY = `${FRAME_POLICY} https://replit.com https://*.replit.dev`;

// Use public configuration, never a request's Host header, to allow the current
// Clerk tenants. Keys are consumed only at runtime and never included in headers.
function clerkOrigins(keys, siteOrigin) {
  const site = new URL(siteOrigin);
  if (site.protocol !== 'https:' || site.username || site.password || site.port
    || site.search || site.hash || site.pathname !== '/') throw new Error('CSP requires a valid HTTPS site origin');
  const origins = new Set([`https://clerk.${site.hostname}`]);
  for (const key of keys.filter(Boolean)) {
    const match = /^pk_(?:test|live)_([a-zA-Z0-9_+/=-]+)$/.exec(key);
    if (!match) throw new Error('Invalid Clerk public configuration for CSP');
    const host = Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]+$/i.test(host)) throw new Error('Invalid Clerk origin for CSP');
    origins.add(`https://${host.toLowerCase()}`);
  }
  return [...origins].join(' ');
}

/** Enforced on documents, redirects, errors and static responses. */
export function storefrontHeaders({
  development = false, html = '',
  siteOrigin = process.env.SEO_SITE_ORIGIN || 'https://glamtoo.webdesignessex.io',
  clerkKeys = [process.env.VITE_CLERK_PUBLISHABLE_KEY, process.env.CLERK_PUBLISHABLE_KEY],
} = {}) {
  const framePolicy = development ? DEVELOPMENT_FRAME_POLICY : FRAME_POLICY;
  const inlineHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].trim())
    .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const clerk = clerkOrigins(clerkKeys, siteOrigin);
  const stripeJs = 'https://js.stripe.com https://*.js.stripe.com';
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${stripeJs} ${clerk} https://*.protect.clerk.com https://challenges.cloudflare.com ${development ? "'unsafe-inline' 'unsafe-eval'" : inlineHashes.join(' ')}`,
    `connect-src 'self' ${clerk} https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.stripe.com https://m.stripe.network https://r.stripe.com https://q.stripe.com https://challenges.cloudflare.com${development ? ' ws: wss:' : ''}`,
    `frame-src 'self' ${stripeJs} https://hooks.stripe.com https://checkout.stripe.com ${clerk} https://*.protect.clerk.com https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    // Catalog admins may use arbitrary HTTPS image URLs; data/blob support existing uploads.
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    "media-src 'self' https://storage.googleapis.com blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    framePolicy,
  ].join('; ');
  return {
    'X-Robots-Tag': NOINDEX,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': policy,
  };
}

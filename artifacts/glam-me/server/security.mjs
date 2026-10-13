import { createHash } from 'node:crypto';

export const NOINDEX = 'noindex, follow';
export const FRAME_POLICY = "frame-ancestors 'self'";
// Development must permit the workspace preview; production needs no such exception.
export const DEVELOPMENT_FRAME_POLICY = `${FRAME_POLICY} https://replit.com https://*.replit.dev`;

/** Candidate only: full Clerk recovery and saved-card/3DS verification is required
 * before moving these directives into the enforcing CSP. See security-policy.md. */
export function storefrontHeaders({ development = false, html = '' } = {}) {
  const framePolicy = development ? DEVELOPMENT_FRAME_POLICY : FRAME_POLICY;
  const inlineHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].trim())
    .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const clerk = 'https://*.clerk.accounts.dev https://*.clerk.com';
  const policy = [
    "default-src 'self'",
    `script-src 'self' https://js.stripe.com ${clerk} https://challenges.cloudflare.com ${development ? "'unsafe-inline' 'unsafe-eval'" : inlineHashes.join(' ')}`,
    `connect-src 'self' ${clerk} https://api.stripe.com https://m.stripe.network https://r.stripe.com https://q.stripe.com https://challenges.cloudflare.com${development ? ' ws: wss:' : ''}`,
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com ${clerk} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Catalog admins may use arbitrary HTTPS image URLs; data/blob support existing uploads.
    "img-src 'self' https: data: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
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
    'Content-Security-Policy': framePolicy,
    'Content-Security-Policy-Report-Only': policy,
  };
}

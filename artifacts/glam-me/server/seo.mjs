import { URL } from 'node:url';

export const SEO_SITE_ORIGIN = process.env.SEO_SITE_ORIGIN || 'https://glamtoo.webdesignessex.io';
export const API_ORIGIN = 'http://127.0.0.1:8080';
export const FALLBACK = {
  title: 'Glam Too Boutique',
  description: 'Affordable fashion, stunning handbags and chic jewellery at Glam Too Boutique.',
  robots: 'noindex, nofollow',
  type: 'website',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// Reject encoded path separators, backslashes and dot segments before touching the filesystem.
export function parseRequestUrl(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\x00-\x1f\\]/.test(raw)) throw new Error('Invalid URL');
  const rawPath = raw.split('?')[0].split('#')[0];
  if (/%(?![0-9a-f]{2})/i.test(rawPath) || /%(?:2f|5c|00)/i.test(rawPath)) throw new Error('Invalid path');
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { throw new Error('Invalid path encoding'); }
  if (decoded.split('/').some((segment) => segment === '..' || segment === '.') || decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid path');
  const url = new URL(raw, 'http://localhost');
  return { pathname: decoded, search: url.search };
}

export function isDocumentPath(pathname) {
  return !(
    pathname.startsWith('/api/') ||
    /^\/(?:@vite|@id|@fs|@react-refresh|__vite|__open-in-editor|src|node_modules|assets)(?:\/|$)/.test(pathname) ||
    /\/[^/]+\.[^/]+$/.test(pathname)
  );
}

export async function resolveSeo(path, fetcher = fetch) {
  const response = await fetcher(`${API_ORIGIN}/api/seo/resolve?path=${encodeURIComponent(path)}`, {
    signal: AbortSignal.timeout(4000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok && response.status !== 404) throw new Error(`SEO resolver returned ${response.status}`);
  const data = await response.json();
  if (!data || ![200, 301, 404].includes(data.status)) throw new Error('Invalid SEO resolver response');
  if (data.status === 301 && (typeof data.location !== 'string' || !data.location.startsWith('/') || data.location.startsWith('//') || /[\\\r\n]/.test(data.location))) throw new Error('Invalid SEO redirect');
  return data;
}

export function injectSeo(html, data = FALLBACK) {
  const title = escapeHtml(data.title || FALLBACK.title);
  const description = escapeHtml(data.description || FALLBACK.description);
  const robots = escapeHtml(data.robots || FALLBACK.robots);
  const canonical = data.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(data.canonicalUrl)}" data-route-seo>` : '';
  const image = data.image ? `<meta property="og:image" content="${escapeHtml(data.image)}" data-route-seo><meta name="twitter:image" content="${escapeHtml(data.image)}" data-route-seo>` : '';
  const tags = `<title data-route-seo>${title}</title>
    <meta name="description" content="${description}" data-route-seo>
    <meta name="robots" content="${robots}" data-route-seo>
    ${canonical}
    <meta property="og:site_name" content="Glam Too Boutique" data-route-seo>
    <meta property="og:title" content="${title}" data-route-seo>
    <meta property="og:description" content="${description}" data-route-seo>
    ${data.canonicalUrl ? `<meta property="og:url" content="${escapeHtml(data.canonicalUrl)}" data-route-seo>` : ''}
    <meta property="og:type" content="${data.type === 'product' ? 'product' : 'website'}" data-route-seo>
    ${image}
    <meta name="twitter:card" content="${data.image ? 'summary_large_image' : 'summary'}" data-route-seo>
    <meta name="twitter:title" content="${title}" data-route-seo>
    <meta name="twitter:description" content="${description}" data-route-seo>`;
  // The static shell contains no route-specific metadata. Replace any older managed
  // tags as well, so repeated transforms cannot duplicate SEO tags.
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>|<(?:meta|link)\b[^>]*data-route-seo\b[^>]*>/gi, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

export async function proxySeoFile(pathname, fetcher = fetch) {
  const endpoint = pathname === '/robots.txt' ? '/api/seo/robots.txt' : '/api/seo/sitemap.xml';
  const response = await fetcher(`${API_ORIGIN}${endpoint}`, { signal: AbortSignal.timeout(4000) });
  return {
    status: response.status,
    body: await response.arrayBuffer(),
    contentType: pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
  };
}
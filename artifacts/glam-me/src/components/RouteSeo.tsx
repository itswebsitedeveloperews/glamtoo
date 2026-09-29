import { useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';

type SeoResponse = {
  status: 200 | 301 | 404;
  location?: string;
  title?: string;
  description?: string;
  canonicalUrl?: string;
  robots?: string;
  type?: 'website' | 'product';
  image?: string;
};

function updateHead(data: Partial<SeoResponse>) {
  document.head.querySelectorAll('[data-route-seo]').forEach((node) => node.remove());
  const title = data.title || 'Glam Too Boutique';
  const description = data.description || 'Affordable fashion, stunning handbags and chic jewellery at Glam Too Boutique.';
  const add = (tag: 'meta' | 'link', attrs: Record<string, string>) => {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    element.setAttribute('data-route-seo', '');
    document.head.appendChild(element);
  };
  const titleElement = document.createElement('title');
  titleElement.setAttribute('data-route-seo', '');
  titleElement.textContent = title;
  document.head.appendChild(titleElement);
  add('meta', { name: 'description', content: description });
  add('meta', { name: 'robots', content: data.robots || 'noindex, nofollow' });
  if (data.canonicalUrl) {
    add('link', { rel: 'canonical', href: data.canonicalUrl });
    add('meta', { property: 'og:url', content: data.canonicalUrl });
  }
  add('meta', { property: 'og:site_name', content: 'Glam Too Boutique' });
  add('meta', { property: 'og:title', content: title });
  add('meta', { property: 'og:description', content: description });
  add('meta', { property: 'og:type', content: data.type === 'product' ? 'product' : 'website' });
  if (data.image) {
    add('meta', { property: 'og:image', content: data.image });
    add('meta', { name: 'twitter:image', content: data.image });
  }
  add('meta', { name: 'twitter:card', content: data.image ? 'summary_large_image' : 'summary' });
  add('meta', { name: 'twitter:title', content: title });
  add('meta', { name: 'twitter:description', content: description });
}

/** Mount inside the Wouter router. HTTP responses remain authoritative for direct visits. */
export default function RouteSeo() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    const path = `${location}${search ? `?${search.replace(/^\?/, '')}` : ''}`;
    // Preserve the server-rendered metadata until this route has been resolved.
    if (lastPath.current !== null && lastPath.current !== path) {
      document.head.querySelector('meta[name="robots"][data-route-seo]')?.setAttribute('content', 'noindex, nofollow');
    }
    lastPath.current = path;
    const controller = new AbortController();
    fetch(`/api/seo/resolve?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok && response.status !== 404) throw new Error(`SEO resolver returned ${response.status}`);
        return response.json() as Promise<SeoResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted || ![200, 301, 404].includes(data.status)) throw new Error('Invalid SEO response');
        if (data.status === 301) {
          if (!data.location?.startsWith('/') || data.location.startsWith('//') || /[\\\r\n]/.test(data.location)) throw new Error('Invalid SEO redirect');
          navigate(data.location, { replace: true });
          return;
        }
        updateHead(data.status === 404 ? { ...data, robots: 'noindex, nofollow' } : data);
      })
      .catch(() => {
        if (!controller.signal.aborted) updateHead({ robots: 'noindex, nofollow' });
      });
    return () => controller.abort();
  }, [location, search, navigate]);
  return null;
}
import type { Catalog } from "./catalogSlugs";

export type SeoResult = { status: 200 | 301 | 404; location?: string; title: string; description: string; canonicalUrl: string; robots: string; type: "website" | "product"; image?: string };
const siteName = "Glam Too";
const staticPages: Record<string, [string, string]> = {
  "/": ["Glam Too | Fashion with presence", "Discover considered fashion, colour and easy confidence at Glam Too."],
  "/shop": ["Shop Women's Fashion | Glam Too", "Explore the latest clothing and accessories at Glam Too."],
  "/category": ["Shop by Category | Glam Too", "Browse Glam Too collections and find your next favourite piece."],
  "/about": ["About Glam Too", "Get to know Glam Too and our love of expressive, wearable fashion."],
  "/faq": ["Frequently Asked Questions | Glam Too", "Answers to frequently asked questions about shopping at Glam Too."],
  "/contact": ["Contact Glam Too", "Get in touch with the Glam Too team for help with your order or a question."],
  "/privacy": ["Privacy Policy | Glam Too", "Learn how Glam Too handles your personal information."],
  "/terms": ["Terms and Conditions | Glam Too", "Read the terms and conditions for shopping with Glam Too."],
  "/returns": ["Returns and Delivery | Glam Too", "Find out about delivery and returns when shopping at Glam Too."],
};
const privatePage = /^\/(?:cart|wishlist|checkout|order-confirmation|admin(?:\/.*)?|account(?:\/.*)?|register(?:\/.*)?|sign-in(?:\/.*)?|sign-up(?:\/.*)?)$/;
const clean = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|#38);/gi, "&").replace(/&(?:quot|#34);/gi, '"').replace(/\s+/g, " ").trim().slice(0, 160);
export function seoOrigin(value: string | undefined): string {
  if (!value) throw new Error("SEO_SITE_ORIGIN must be configured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("SEO_SITE_ORIGIN must be an HTTPS origin");
  return url.origin;
}
const history = (item: Record<string, unknown>) => Array.isArray(item.slugHistory) ? item.slugHistory.map((alias) => String(alias).toLowerCase()) : [];
const encodedPath = (base: string, slug: string) => `${base}/${encodeURIComponent(slug)}`;
export function resolveSeo(path: string, catalog: Catalog, origin: string): SeoResult {
  const notFound = (): SeoResult => ({ status: 404, title: `Page not found | ${siteName}`, description: "This page could not be found. Explore the latest pieces at Glam Too.", canonicalUrl: `${origin}/`, robots: "noindex, follow", type: "website" });
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return notFound();
  let url: URL;
  try { url = new URL(path, origin); } catch { return notFound(); }
  if (url.origin !== origin || /%2f|%5c/i.test(url.pathname)) return notFound();
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/"; } catch { return notFound(); }
  if (pathname.includes("//") || pathname.includes("\\") || pathname.split("/").some((segment) => segment === "." || segment === "..")) return notFound();
  const normalized = pathname.toLowerCase();
  let target = normalized;
  let title: string;
  let description: string;
  let type: "website" | "product" = "website";
  let image: string | undefined;
  let noindex = false;
  if (normalized === "/delivery-returns") target = "/returns";
  const productMatch = /^\/product\/([^/]+)$/.exec(normalized);
  const categoryMatch = /^\/category\/([^/]+)$/.exec(normalized);
  if (productMatch) {
    const match = catalog.products.find((item) => String(item.slug).toLowerCase() === productMatch[1])
      || catalog.products.find((item) => String(item.id) === productMatch[1])
      || catalog.products.find((item) => history(item).includes(productMatch[1]));
    if (!match || match.status !== "Published") return notFound();
    target = encodedPath("/product", String(match.slug));
    title = `${clean(match.name)} | ${siteName}`;
    description = clean(match.description) || `Shop ${clean(match.name)} at Glam Too. Discover expressive fashion for every occasion.`;
    type = "product";
    const primaryImage = typeof match.image === "string" ? match.image.trim() : "";
    const candidate = primaryImage || String((Array.isArray(match.galleryImages) ? match.galleryImages.find((entry) => typeof entry === "string" && entry.trim()) : "") || "").trim();
    if (candidate.startsWith("/") && !candidate.startsWith("//")) image = `${origin}${candidate}`;
    else if (/^https:\/\//i.test(candidate)) image = candidate;
  } else if (categoryMatch) {
    const match = catalog.categories.find((item) => String(item.slug).toLowerCase() === categoryMatch[1])
      || catalog.categories.find((item) => history(item).includes(categoryMatch[1]));
    if (!match) return notFound();
    target = encodedPath("/category", String(match.slug));
    title = `${clean(match.name)} | Shop Categories | ${siteName}`;
    description = clean(match.description) || `Explore ${clean(match.name)} at Glam Too and find pieces made for your next moment.`;
    const candidate = String(match.image || "");
    if (candidate.startsWith("/") && !candidate.startsWith("//")) image = `${origin}${candidate}`;
    else if (/^https:\/\//i.test(candidate)) image = candidate;
  } else if (staticPages[target]) {
    [title, description] = staticPages[target];
  } else if (privatePage.test(target)) {
    title = `Your account and shopping | ${siteName}`;
    description = "Your private Glam Too shopping page.";
    noindex = true;
  } else return notFound();

  const pageValues = url.searchParams.getAll("page");
  const validPage = pageValues.length <= 1 && (pageValues.length === 0 || /^[1-9]\d*$/.test(pageValues[0]));
  const page = validPage && pageValues.length ? Number(pageValues[0]) : 1;
  const hasFilters = [...url.searchParams.keys()].some((key) => !["page", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "msclkid"].includes(key));
  if (hasFilters || !validPage || !Number.isSafeInteger(page)) noindex = true;
  if (target === "/shop" && !noindex && page > 1) {
    const maxPage = Math.max(1, Math.ceil(catalog.products.filter((item) => item.status === "Published").length / 12));
    if (page <= maxPage) target += `?page=${page}`;
    else noindex = true;
  } else if (pageValues.length && target !== "/shop") noindex = true;
  const canonicalUrl = `${origin}${target}`;
  const result: SeoResult = { status: 200, title, description, canonicalUrl, robots: noindex ? "noindex, follow" : "index, follow", type };
  if (image) result.image = image;
  // Redirect only URL-path aliases and normalization, never untrusted query values.
  if (pathname !== target.split("?")[0] && !privatePage.test(target)) {
    return { ...result, status: 301, location: target };
  }
  return result;
}

export function sitemapXml(catalog: Catalog, origin: string): string {
  const paths = [
    ...Object.keys(staticPages),
    ...catalog.categories.map((item) => encodedPath("/category", String(item.slug))),
    ...catalog.products.filter((item) => item.status === "Published").map((item) => encodedPath("/product", String(item.slug))),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${`${origin}${path}`.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</loc></url>`).join("")}</urlset>`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`;
}
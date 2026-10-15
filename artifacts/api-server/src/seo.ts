import type { Catalog } from "./catalogSlugs";

export type SeoResult = { status: 200 | 301 | 404; location?: string; title: string; description: string; canonicalUrl: string; robots: string; type: "website" | "product"; image?: string; structuredData?: Record<string, unknown> };
export type SeoInventory = Record<string, { unitAmount: number; stock: number }>;
export const NOINDEX = "noindex, follow";
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
const privatePages: Record<string, [string, string]> = {
  "/account": ["My Account | Glam Too", "Sign in to your Glam Too account to manage orders, addresses and account details."],
  "/register": ["Create an Account | Glam Too", "Create your Glam Too account to keep your details ready for checkout and manage future orders."],
  "/account/recovery": ["Reset Your Password | Glam Too", "Securely recover access to your Glam Too account using an email verification code."],
  "/cart": ["Shopping Bag | Glam Too", "Review your Glam Too shopping bag, quantities and delivery before checkout."],
  "/wishlist": ["My Wishlist | Glam Too", "Review your saved Glam Too favourites and choose pieces for your next order."],
  "/checkout": ["Secure Checkout | Glam Too", "Review your order, enter billing and delivery details, and pay securely."],
  "/order-confirmation": ["Order Confirmation | Glam Too", "Check the confirmation and next steps for your Glam Too purchase."],
  "/admin": ["Store Administration | Glam Too", "Secure administration for authorised users to manage Glam Too products, orders and store settings."],
};
const accountSections: Record<string, [string, string]> = {
  dashboard: ["My Account | Glam Too", "Manage your Glam Too orders, account details and delivery preferences."],
  orders: ["My Orders | Glam Too", "Review your Glam Too orders and their payment and delivery status."],
  addresses: ["My Addresses | Glam Too", "Manage the billing and delivery addresses saved in your Glam Too account."],
  "payment-methods": ["My Payment Methods | Glam Too", "Manage the payment methods saved securely for your Glam Too account."],
  "account-details": ["My Account Details | Glam Too", "Update your Glam Too account details and personal preferences securely."],
};
const clean = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|#38);/gi, "&").replace(/&(?:quot|#34);/gi, '"').replace(/\s+/g, " ").trim().slice(0, 160);
export function seoOrigin(value: string | undefined): string {
  if (!value) throw new Error("SEO_SITE_ORIGIN must be configured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("SEO_SITE_ORIGIN must be an HTTPS origin");
  return url.origin;
}
const history = (item: Record<string, unknown>) => Array.isArray(item.slugHistory) ? item.slugHistory.map((alias) => String(alias).toLowerCase()) : [];
const encodedPath = (base: string, slug: string) => `${base}/${encodeURIComponent(slug)}`;
const publicImage = (value: unknown, origin: string): string | undefined => {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\\]/.test(value)) return;
  const candidate = value.trim();
  if (!candidate.startsWith("/") && !/^https:\/\//i.test(candidate)) return;
  if (candidate.startsWith("//")) return;
  try {
    const url = new URL(candidate, origin);
    if (/(?:^|\.)(?:replit\.dev|repl\.co|localhost|local|internal|test)$/.test(url.hostname.toLowerCase().replace(/\.$/, ""))) return;
    // Uploaded catalogue references use /objects/, while the public serving
    // route (also used by the storefront gallery) is /api/storage/objects/.
    if (url.origin === new URL(origin).origin && url.pathname.startsWith("/objects/")) {
      url.pathname = `/api/storage${url.pathname}`;
    }
    // Catalogs seeded from Vite can contain development-only file/module URLs.
    // These are not public production media and must never be advertised.
    if (/^\/(?:@fs|@vite|@id|src|node_modules)(?:\/|$)/.test(url.pathname)) return;
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Omit invalid or browser-only media references. */ }
  return undefined;
};
const pricePence = (value: unknown): number | undefined => {
  if (typeof value !== "string") return;
  const price = value.trim().replace(/^£\s*/, "").replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) return;
  const amount = Math.round(Number(price) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
};
function productData(product: Record<string, unknown>, url: string, origin: string, inventory?: SeoInventory) {
  const data: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Product", name: clean(product.name), url };
  const description = clean(product.description);
  if (description) data.description = description;
  if (typeof product.sku === "string" && product.sku.trim()) data.sku = product.sku.trim();
  const images = [...new Set([product.image, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])]
    .map((value) => publicImage(value, origin)).filter((value): value is string => Boolean(value)))];
  if (images.length) data.image = images;
  const variants = product.type === "Variable" && Array.isArray(product.variations)
    ? product.variations.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    : product.type === "Simple" ? [product] : [];
  const offers = variants.flatMap((variant) => {
    const key = product.type === "Variable" ? `${product.id}:${variant.id}` : String(product.id);
    const live = inventory?.[key];
    const regular = pricePence(variant.price);
    const sale = product.type === "Simple" ? pricePence(product.salePrice) : undefined;
    const displayed = sale && regular && sale < regular ? sale : regular;
    // Only emit offers confirmed by checkout inventory, matching the displayed price.
    // Never substitute a variable parent's administrative price or stale catalog stock.
    if (!live || displayed !== live.unitAmount || !Number.isSafeInteger(live.unitAmount) || live.unitAmount <= 0
      || !Number.isInteger(live.stock) || live.stock < 0) return [];
    return [{ "@type": "Offer", url, priceCurrency: "GBP", price: (live.unitAmount / 100).toFixed(2),
      seller: { "@type": "Organization", name: siteName, url: origin },
      availability: `https://schema.org/${live.stock > 0 ? "InStock" : "OutOfStock"}`,
      ...(typeof variant.sku === "string" && variant.sku.trim() ? { sku: variant.sku.trim() } : {}) }];
  });
  if (offers.length) data.offers = offers;
  return data;
}
export function resolveSeo(path: string, catalog: Catalog, origin: string, inventory?: SeoInventory): SeoResult {
  const notFound = (): SeoResult => ({ status: 404, title: `Page not found | ${siteName}`, description: "This page could not be found. Explore the latest pieces at Glam Too.", canonicalUrl: "", robots: "noindex, nofollow", type: "website" });
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
  let product: Record<string, unknown> | undefined;
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
    product = match;
    image = [match.image, ...(Array.isArray(match.galleryImages) ? match.galleryImages : [])]
      .map((candidate) => publicImage(candidate, origin)).find(Boolean);
  } else if (categoryMatch) {
    const match = catalog.categories.find((item) => String(item.slug).toLowerCase() === categoryMatch[1])
      || catalog.categories.find((item) => history(item).includes(categoryMatch[1]));
    if (!match) return notFound();
    target = encodedPath("/category", String(match.slug));
    title = `${clean(match.name)} | Shop Categories | ${siteName}`;
    description = clean(match.description) || `Explore ${clean(match.name)} at Glam Too and find pieces made for your next moment.`;
    const candidate = String(match.image || "");
    image = publicImage(candidate, origin);
  } else if (staticPages[target]) {
    [title, description] = staticPages[target];
    if (target === "/") image = `${origin}/social-home.webp`;
  } else if (privatePage.test(target)) {
    if (target.startsWith("/admin/")) return notFound();
    if (/^\/(?:account|sign-in)(?:\/|$)/.test(target)) target = /^\/account\/recovery(?:\/|$)/.test(target) ? "/account/recovery" : "/account";
    else if (/^\/(?:register|sign-up)(?:\/|$)/.test(target)) target = "/register";
    const section = url.searchParams.get("section") || "";
    const copy = target === "/account" && Object.hasOwn(accountSections, section)
      ? accountSections[section] : privatePages[target];
    if (!copy) return notFound();
    [title, description] = copy;
    noindex = true;
  } else return notFound();

  const pageValues = url.searchParams.getAll("page");
  const validPage = pageValues.length <= 1 && (pageValues.length === 0 || /^[1-9]\d*$/.test(pageValues[0]));
  const page = validPage && pageValues.length ? Number(pageValues[0]) : 1;
  const hasFilters = [...url.searchParams.keys()].some((key) => !["page", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "msclkid"].includes(key));
  if (hasFilters || !validPage || !Number.isSafeInteger(page)) noindex = true;
  if (target === "/shop" && !noindex && page > 1) {
    const maxPage = Math.max(1, Math.ceil(catalog.products.filter((item) => item.status === "Published").length / 12));
    if (page <= maxPage) {
      target += `?page=${page}`;
      title = `Shop Women's Fashion — Page ${page} | Glam Too`;
      description = `Explore page ${page} of Glam Too clothing and accessories. Discover more pieces from our current collection.`;
    }
    else noindex = true;
  } else if (pageValues.length && target !== "/shop") noindex = true;
  const canonicalUrl = `${origin}${target}`;
  const result: SeoResult = { status: 200, title, description, canonicalUrl, robots: NOINDEX, type };
  if (image) result.image = image;
  if (product) result.structuredData = productData(product, canonicalUrl, origin, inventory);
  else if (!privatePage.test(target)) {
    const pageType = target === "/about" ? "AboutPage" : target === "/contact" ? "ContactPage"
      : /^\/(?:shop|category)(?:[/?]|$)/.test(target) ? "CollectionPage" : "WebPage";
    result.structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": `${origin}/#organization`, name: siteName, url: `${origin}/` },
        { "@type": "WebSite", "@id": `${origin}/#website`, name: siteName, url: `${origin}/`, publisher: { "@id": `${origin}/#organization` } },
        { "@type": pageType, "@id": `${canonicalUrl}#webpage`, url: canonicalUrl, name: title, description, isPartOf: { "@id": `${origin}/#website` } },
      ],
    };
  }
  // Redirect only URL-path aliases and normalization, never untrusted query values.
  if (pathname !== target.split("?")[0] && !privatePage.test(target)) {
    return { ...result, status: 301, location: target };
  }
  return result;
}

export function sitemapXml(catalog: Catalog, origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n`;
}
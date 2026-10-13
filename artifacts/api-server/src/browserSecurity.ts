import type { Request, RequestHandler } from "express";

/** Explicit deployment configuration only; request/forwarded hosts are not authority. */
export function trustedOrigins(): Set<string> {
  // The existing canonical SEO origin is explicit merchant configuration, not
  // an inferred request host. An explicit browser list overrides this default.
  const configured = (process.env.TRUSTED_BROWSER_ORIGINS ?? process.env.SEO_SITE_ORIGIN ?? "").split(",");
  // The workspace domain is platform configuration, not a caller-supplied header.
  if (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN) {
    configured.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  return new Set(configured.map((value) => value.trim()).filter((value) => {
    try { return new URL(value).origin === value && /^https?:\/\//.test(value); }
    catch { return false; }
  }));
}

export function browserOriginAllowed(request: Request): boolean {
  const origin = request.get("origin");
  if (origin) return trustedOrigins().has(origin);
  // Missing Origin is allowed for same-origin browsers and non-browser clients.
  // Neither bypasses authentication, guest ownership, or shared abuse controls.
  return !["cross-site", "same-site"].includes(request.get("sec-fetch-site") ?? "");
}

export function checkoutReturnOrigin(request: Request): string {
  const origin = request.get("origin");
  if (origin && trustedOrigins().has(origin)) return origin;
  const configured = process.env.STOREFRONT_ORIGIN ?? process.env.SEO_SITE_ORIGIN;
  if (configured && trustedOrigins().has(configured)) return configured;
  const origins = [...trustedOrigins()];
  if (origins.length === 1) return origins[0];
  throw new Error("A trusted storefront return origin must be configured.");
}

export const baselineHeaders: RequestHandler = (_request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
};

export const enforceBrowserMutations: RequestHandler = (request, response, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !browserOriginAllowed(request)) {
    response.status(403).json({ error: "Send this request from the trusted shop website.", code: "untrusted_origin" });
    return;
  }
  next();
};

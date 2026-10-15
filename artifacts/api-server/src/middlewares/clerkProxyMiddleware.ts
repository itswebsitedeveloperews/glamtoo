import type { IncomingHttpHeaders } from "http";
import type { RequestHandler, Request } from "express";
import { trustedOrigins, checkoutReturnOrigin } from "../browserSecurity";
import { createProxyServer } from "httpxy";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const configured = [...trustedOrigins()].map((origin) => new URL(origin).host);
  const host = req.headers.host?.trim();
  const canonical = process.env.STOREFRONT_ORIGIN ?? process.env.SEO_SITE_ORIGIN;
  // Proxy host headers are not identity authority. Prefer canonical deployment
  // configuration when an internal proxy has rewritten Host.
  return host && configured.includes(host) ? host
    : canonical && trustedOrigins().has(canonical)
      ? new URL(canonical).host
      : configured.length === 1 ? configured[0] : undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createClerkProxyHandler(CLERK_FAPI, secretKey);
}

/** Separate construction permits local upstream tests without Clerk credentials. */
export function createClerkProxyHandler(target: string, secretKey: string): RequestHandler {
  // This is the same engine formerly used by http-proxy-middleware, without
  // its unused glob filtering dependency (micromatch/braces).
  const proxy = createProxyServer({
    target,
    changeOrigin: true,
    selfHandleResponse: true,
  });
  proxy.on("proxyReq", (proxyReq, req) => {
    const origin = checkoutReturnOrigin(req as Request);
    proxyReq.setHeader("Clerk-Proxy-Url", `${origin}${CLERK_PROXY_PATH}`);
    proxyReq.setHeader("Clerk-Secret-Key", secretKey);
    const clientIp = (req as Request).ip || req.socket?.remoteAddress || "";
    if (clientIp) proxyReq.setHeader("X-Forwarded-For", clientIp);
  });
  proxy.on("proxyRes", (proxyRes, req, res) => {
    const headers = { ...proxyRes.headers };
    delete headers["transfer-encoding"];
    delete headers["connection"];
    delete headers["keep-alive"];
    const status = proxyRes.statusCode ?? 502;
    if (status < 200 || status === 204) delete headers["content-length"];
    const bodyless =
      req.method === "HEAD" ||
      status < 200 ||
      status === 204 ||
      status === 304;
    if (headers["content-length"] !== undefined || bodyless) {
      res.writeHead(status, headers);
      proxyRes.on("error", () => res.destroy());
      proxyRes.pipe(res);
      return;
    }
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks);
      headers["content-length"] = String(body.length);
      res.writeHead(status, headers);
      res.end(body);
    });
    proxyRes.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-length": "0" });
      }
      res.end();
    });
  });
  return async (req, res) => {
    const originalUrl = req.url;
    try {
      // Express strips the mount prefix; also support an unmounted handler.
      req.url = req.url.replace(new RegExp(`^${CLERK_PROXY_PATH}(?=/|\\?|$)`), "") || "/";
      // Resolve configuration before entering an asynchronous proxy event.
      checkoutReturnOrigin(req);
      await proxy.web(req, res);
    } catch {
      if (res.headersSent) res.destroy();
      else res.status(502).end();
    } finally {
      req.url = originalUrl;
    }
  };
}
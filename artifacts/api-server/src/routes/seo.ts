import { Router, type IRouter } from "express";
import { getCatalogRecord } from "./catalog";
import { resolveSeo, robotsTxt, seoOrigin, sitemapXml } from "../seo";

const router: IRouter = Router();
router.get("/seo/resolve", async (request, response) => {
  if (typeof request.query.path !== "string") {
    response.status(400).json({ error: "A relative path is required." });
    return;
  }
  try {
    const origin = seoOrigin(process.env.SEO_SITE_ORIGIN);
    const catalog = await getCatalogRecord();
    response.set("Cache-Control", "no-store").json(resolveSeo(request.query.path, catalog, origin));
  } catch (error) {
    request.log.error({ error }, "SEO resolution unavailable");
    response.status(503).json({ error: "SEO resolution is temporarily unavailable." });
  }
});
router.get("/seo/sitemap.xml", async (request, response) => {
  try {
    const origin = seoOrigin(process.env.SEO_SITE_ORIGIN);
    const catalog = await getCatalogRecord();
    response.type("application/xml").set("Cache-Control", "no-store").send(sitemapXml(catalog, origin));
  } catch (error) {
    request.log.error({ error }, "Sitemap unavailable");
    response.status(503).json({ error: "Sitemap is temporarily unavailable." });
  }
});
router.get("/seo/robots.txt", (_request, response) => {
  try {
    const origin = seoOrigin(process.env.SEO_SITE_ORIGIN);
    response.type("text/plain").send(robotsTxt(origin));
  } catch {
    response.status(503).json({ error: "Robots policy is temporarily unavailable." });
  }
});
export default router;
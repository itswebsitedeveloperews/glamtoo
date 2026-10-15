import { Router, type RequestHandler } from "express";
import { DeleteHeroSlideBody } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { heroSlideInput, heroSlideUpdate, validHeroCTA, listHeroSlides, createHeroSlide, updateHeroSlide, deleteHeroSlide } from "../heroSlides";
import { AnnouncementConflict, AnnouncementNotFound } from "../announcements";

export function createHeroSlidesRouter(authorize: RequestHandler = requireAdmin) {
  const router = Router();
  const idOf = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
  router.use(["/hero-slides", "/admin/hero-slides"], (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.get("/hero-slides", async (_req, res, next) => {
    try { res.json({ slides: await listHeroSlides(true) }); } catch (error) { next(error); }
  });
  router.get("/admin/hero-slides", authorize, async (_req, res, next) => {
    try { res.json({ slides: await listHeroSlides() }); } catch (error) { next(error); }
  });
  router.post("/admin/hero-slides", authorize, async (req, res, next) => {
    const parsed = heroSlideInput.safeParse(req.body);
    if (!parsed.success || !validHeroCTA(parsed.data)) return res.status(400).json({ error: "Check slide images, alt text and fields. A CTA needs both text and a safe link." });
    try { return res.status(201).json(await createHeroSlide(parsed.data)); } catch (error) { return next(error); }
  });
  router.patch("/admin/hero-slides/:id", authorize, async (req, res, next) => {
    const parsed = heroSlideUpdate.safeParse(req.body);
    const id = idOf(req.params.id);
    if (!id || !parsed.success || !validHeroCTA(parsed.data)) return res.status(400).json({ error: "Check slide fields, CTA and revision before saving." });
    const { expectedRevision, ...input } = parsed.data;
    try { return res.json(await updateHeroSlide(id, input, expectedRevision)); } catch (error) { return next(error); }
  });
  router.delete("/admin/hero-slides/:id", authorize, async (req, res, next) => {
    const parsed = DeleteHeroSlideBody.strict().safeParse(req.body);
    const id = idOf(req.params.id);
    if (!id || !parsed.success) return res.status(400).json({ error: "Refresh the slide before deleting it." });
    try { await deleteHeroSlide(id, parsed.data.expectedRevision); return res.sendStatus(204); } catch (error) { return next(error); }
  });
  router.use(((error, req, res, _next) => {
    if (error instanceof AnnouncementConflict) return res.status(409).json({ error: error.message });
    if (error instanceof AnnouncementNotFound) return res.status(404).json({ error: error.message });
    req.log?.error("Hero slide operation failed");
    return res.status(503).json({ error: "Slides are temporarily unavailable. Please try again." });
  }) satisfies import("express").ErrorRequestHandler);
  return router;
}
export default createHeroSlidesRouter();

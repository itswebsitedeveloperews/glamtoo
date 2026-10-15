import { Router, type RequestHandler, type Response, type Request } from "express";
import { DeleteAnnouncementBody } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { announcementInput, announcementUpdate, listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, AnnouncementConflict, AnnouncementNotFound } from "../announcements";

// Dependency injection is only for isolated server tests; production uses the
// existing administrator middleware, never a request-controlled permission flag.
export function createAnnouncementsRouter(authorize: RequestHandler = requireAdmin) {
  const router = Router();
  router.use(["/announcements", "/admin/announcements"], (_req, res, next) => {
    res.set("Cache-Control", "no-store"); next();
  });
  const fail = (request: Request, response: Response, error: unknown) => {
    if (error instanceof AnnouncementConflict) return response.status(409).json({ error: error.message });
    if (error instanceof AnnouncementNotFound) return response.status(404).json({ error: error.message });
    request.log?.error("Announcement operation failed");
    return response.status(503).json({ error: "Announcements are temporarily unavailable. Please try again." });
  };
  const idOf = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
  router.get("/announcements", async (req, res) => {
    try { res.json({ announcements: await listAnnouncements(true) }); } catch (error) { fail(req, res, error); }
  });
  router.get("/admin/announcements", authorize, async (req, res) => {
    try { res.json({ announcements: await listAnnouncements() }); } catch (error) { fail(req, res, error); }
  });
  router.post("/admin/announcements", authorize, async (req, res) => {
    const parsed = announcementInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter text (1–160 characters), a safe optional link, an order from 0–10000, and an enabled status.", details: parsed.error.flatten() });
    try { return res.status(201).json(await createAnnouncement(parsed.data)); } catch (error) { return fail(req, res, error); }
  });
  router.patch("/admin/announcements/:id", authorize, async (req, res) => {
    const id = idOf(req.params.id);
    const parsed = announcementUpdate.safeParse(req.body);
    if (!id || !parsed.success) return res.status(400).json({ error: "Check the announcement fields and refresh before editing." });
    try { return res.json(await updateAnnouncement(id, parsed.data, parsed.data.expectedRevision)); } catch (error) { return fail(req, res, error); }
  });
  router.delete("/admin/announcements/:id", authorize, async (req, res) => {
    const id = idOf(req.params.id);
    const parsed = DeleteAnnouncementBody.strict().safeParse(req.body);
    if (!id || !parsed.success) return res.status(400).json({ error: "Refresh the announcement before deleting it." });
    try { await deleteAnnouncement(id, parsed.data.expectedRevision); return res.sendStatus(204); } catch (error) { return fail(req, res, error); }
  });
  return router;
}
export default createAnnouncementsRouter();

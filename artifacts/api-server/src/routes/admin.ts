import { Router, type IRouter } from "express";
import { getAdminAccess } from "../adminAuth";

const router: IRouter = Router();

router.get("/admin/access", async (request, response) => {
  try {
    const access = await getAdminAccess(request);
    if (!access.authenticated) {
      return response.status(401).json(access);
    }
    if (!access.authorized) {
      return response.status(403).json(access);
    }
    return response.set("Cache-Control", "no-store").json(access);
  } catch (error) {
    request.log?.error({ error }, "Admin access endpoint failed");
    return response.status(503).json({ authenticated: true, authorized: false, error: "Admin access could not be verified right now." });
  }
});

export default router;
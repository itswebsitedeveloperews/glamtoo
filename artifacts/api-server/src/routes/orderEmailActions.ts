import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { RequestOrderEmailActionBody, RequestOrderEmailActionParams } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { OrderEmailActionError, requestOrderEmailAction } from "../orderEmailActions";

const router: IRouter = Router();
router.post("/admin/orders/:orderId/email-actions", requireAdmin, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const params = RequestOrderEmailActionParams.safeParse(req.params);
  const body = RequestOrderEmailActionBody.strict().safeParse(req.body);
  if (!params.success || !body.success
    || (body.data.action === "retry") !== (body.data.notificationId !== undefined)) {
    res.status(400).json({ error: "Choose a valid order and action, approve its recipient snapshot and explicitly confirm." });
    return;
  }
  try {
    await requestOrderEmailAction(params.data.orderId, body.data, getAuth(req).userId!);
    res.status(202).end();
  } catch (error) {
    if (error instanceof OrderEmailActionError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log?.error("Order email action could not be queued");
    res.status(503).json({ error: "The email action could not be confirmed. Refresh its status before trying again." });
  }
});
export default router;

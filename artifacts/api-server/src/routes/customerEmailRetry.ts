import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { ApproveCustomerConfirmationBody } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { enforceBrowserMutations } from "../browserSecurity";
import { approveCustomerEmailRetry, CustomerEmailRetryError } from "../customerEmailRetry";

const router: IRouter = Router();
router.post("/admin/orders/:reference/customer-email/retry",
  (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); },
  requireAdmin, enforceBrowserMutations, async (req, res) => {
    const reference = req.params.reference;
    const body = ApproveCustomerConfirmationBody.safeParse(req.body);
    if (typeof reference !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(reference)
      || !body.success || Object.keys(req.body ?? {}).some(key => key !== "confirmation")) {
      return res.status(400).json({ error: "Confirm sending the saved order confirmation. Custom recipients are not accepted." });
    }
    try {
      return res.json(await approveCustomerEmailRetry(reference, getAuth(req).userId!));
    } catch (error) {
      if (error instanceof CustomerEmailRetryError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "Customer confirmation approval could not be saved. Refresh before trying again." });
    }
  });
export default router;

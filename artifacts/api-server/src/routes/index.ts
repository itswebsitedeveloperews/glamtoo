import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import healthRouter from "./health";
import stripeRouter from "./stripe";
import storageRouter from "./storage";
import catalogRouter from "./catalog";
import contactRouter from "./contact";
import { listShippingMethods, serializeShippingMethod } from "../shippingMethods";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(storageRouter);
router.use(catalogRouter);
router.use(contactRouter);
router.get("/shipping-methods", async (_request, response) => {
  try { response.set("Cache-Control", "no-store").json({ shippingMethods: (await listShippingMethods(true)).map(serializeShippingMethod) }); }
  catch { response.status(503).json({ error: "Shipping methods could not be loaded right now." }); }
});

export default router;

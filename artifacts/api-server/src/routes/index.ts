import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import healthRouter from "./health";
import stripeRouter from "./stripe";
import storageRouter from "./storage";
import catalogRouter from "./catalog";
import contactRouter from "./contact";
import seoRouter from "./seo";
import { listShippingMethods, serializeShippingMethod } from "../shippingMethods";
import { listDeliveryInformation, serializeDeliveryInformation } from "../deliveryInformation";
import { listSizeGuide, serializeSizeGuideRow } from "../sizeGuide";
import { getReturnInformation } from "../returnInformation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(storageRouter);
router.use(catalogRouter);
router.use(contactRouter);
router.use(seoRouter);
router.get("/shipping-methods", async (_request, response) => {
  try { response.set("Cache-Control", "no-store").json({ shippingMethods: (await listShippingMethods(true)).map(serializeShippingMethod) }); }
  catch { response.status(503).json({ error: "Shipping methods could not be loaded right now." }); }
});
router.get("/delivery-information", async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({
      deliveryInformation: (await listDeliveryInformation()).map(serializeDeliveryInformation),
    });
  } catch (error) {
    request.log?.error({ error }, "Public delivery information could not be loaded");
    return response.status(503).json({ error: "Delivery information could not be loaded right now." });
  }
});
router.get("/return-information", async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json(await getReturnInformation());
  } catch (error) {
    request.log?.error({ error }, "Public return information could not be loaded");
    return response.status(503).json({ error: "Return information could not be loaded right now." });
  }
});
router.get("/size-guide", async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({
      sizeGuide: (await listSizeGuide()).map(serializeSizeGuideRow),
    });
  } catch (error) {
    request.log?.error({ error }, "Public size guide could not be loaded");
    return response.status(503).json({ error: "Size guide could not be loaded right now." });
  }
});

export default router;

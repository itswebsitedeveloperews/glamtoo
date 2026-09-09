import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import healthRouter from "./health";
import stripeRouter from "./stripe";
import storageRouter from "./storage";
import catalogRouter from "./catalog";
import contactRouter from "./contact";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(storageRouter);
router.use(catalogRouter);
router.use(contactRouter);

export default router;

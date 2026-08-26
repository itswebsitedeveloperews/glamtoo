import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import healthRouter from "./health";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(adminRouter);
router.use(stripeRouter);

export default router;

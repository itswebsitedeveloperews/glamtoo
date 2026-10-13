import express, { type Express } from "express";
import cors from "cors";
import { baselineHeaders, enforceBrowserMutations, trustedOrigins } from "./browserSecurity";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.disable("x-powered-by");
// Only explicitly configured proxy IPs/CIDRs may supply the client address.
if (process.env.TRUSTED_PROXY_CIDRS) app.set("trust proxy", process.env.TRUSTED_PROXY_CIDRS.split(",").map((value) => value.trim()));
app.use(baselineHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, enforceBrowserMutations, clerkProxyMiddleware());

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });

    try {
      const stripeSignature = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, stripeSignature);
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error({ error }, "Stripe webhook processing failed");
      return res.status(400).json({ error: "Stripe webhook processing failed" });
    }
  },
);

app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, Boolean(origin && trustedOrigins().has(origin))) }));
app.use(enforceBrowserMutations);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;

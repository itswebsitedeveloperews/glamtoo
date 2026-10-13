import app from "./app";
import { logger } from "./lib/logger";
import { startExpiredOrderRecovery } from "./routes/stripe";
import { initializeStripe } from "./stripeBootstrap";
import { isRefundEmailDeliveryConfigured, startRefundNotificationWorker } from "./refundNotifications";
import { isOrderEmailConfigured, startOrderConfirmationWorker } from "./orderConfirmationNotifications";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await initializeStripe();
  logger.info("Stripe initialization completed");
} catch (error) {
  logger.error(
    { error },
    "Stripe is not configured yet. The API will stay available, but payment routes will report configuration status until credentials are added.",
  );
}

startExpiredOrderRecovery();
if (!isRefundEmailDeliveryConfigured()) {
  logger.warn(
    "Refund emails are queued; configure MailerSend and the safe recipient policy before sending.",
  );
}
startRefundNotificationWorker();
if (!isOrderEmailConfigured()) {
  logger.warn("Order confirmation email is queued but not being sent; configure MailerSend, a verified sender, the shop URL, and the recipient allowlist.");
}
startOrderConfirmationWorker();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

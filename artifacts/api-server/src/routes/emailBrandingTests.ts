import { Router } from "express";
import { getAuth } from "@clerk/express";
import { SendEmailBrandingTestsBody } from "@workspace/api-zod";
import { requireAdmin } from "../adminAuth";
import { brandingApproval, BrandingBatchUsed, sendBrandingBatch } from "../emailBrandingTests";
import { brandingTestStore, listBrandingSamples } from "../emailBrandingTestStore";
import { gmailOAuthClient } from "../gmailOAuthCredentials";
import { GmailSmtpError, gmailSmtpConfiguration, sendGmailContactNotification, verifyGmailSmtp } from "../gmailSmtp";

const router = Router();
router.use("/admin/email-branding-tests", (_req, res, next) => {
  res.set("Cache-Control", "no-store"); next();
}, requireAdmin);
async function status() {
  const approval = brandingApproval();
  const samples = approval ? await listBrandingSamples(approval.key) : [];
  const sender = await gmailSmtpConfiguration();
  return { configured: !!approval && !!sender, recipient: approval?.recipient ?? "", canSend: !!approval && !!sender && !samples.length, samples };
}
router.get("/admin/email-branding-tests", async (_req, res) => {
  try { res.json(await status()); }
  catch { res.status(503).json({ error: "Synthetic email settings or storage are unavailable." }); }
});
router.post("/admin/email-branding-tests", async (req, res) => {
  const parsed = SendEmailBrandingTestsBody.strict().safeParse(req.body);
  const approval = brandingApproval();
  const client = gmailOAuthClient();
  if (!client || req.headers.origin !== new URL(client.redirectUri).origin) {
    return void res.status(403).json({ error: "Start synthetic tests from this shop's admin page." });
  }
  if (!parsed.success || !approval || parsed.data.recipient.toLowerCase() !== approval.recipient) {
    return void res.status(400).json({ error: "Confirm five synthetic messages to the separately approved test recipient." });
  }
  try {
    if ((await listBrandingSamples(approval.key)).length) throw new BrandingBatchUsed();
    const config = await gmailSmtpConfiguration();
    if (!config) return void res.status(503).json({ error: "Gmail sender authorization is unavailable. No test email was sent." });
    await verifyGmailSmtp(config); // Authentication only, before consuming the approval.
    await sendBrandingBatch(approval, getAuth(req).userId!, new URL(client.redirectUri).origin, brandingTestStore,
      sample => sendGmailContactNotification(config, 0, approval.recipient,
        sample.variant === "contact" ? "synthetic@example.invalid" : config.replyTo,
        sample.message, sample.messageId),
      error => error instanceof GmailSmtpError && error.kind !== "uncertain" ? "failed" : "uncertain");
    res.json(await status());
  } catch (error) {
    if (error instanceof BrandingBatchUsed) return void res.status(409).json({ error: "This approval has already been used. Refresh the recorded outcomes; do not resend." });
    // Do not expose SMTP errors, credentials, headers or recipient details in logs.
    res.status(503).json({ error: "The batch could not finish. Refresh recorded outcomes before taking any further action; no automatic retry will run." });
  }
});
export default router;

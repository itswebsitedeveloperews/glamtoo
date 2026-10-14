import { Router } from "express";
import { SaveAdminContactNotificationSettingsBody } from "@workspace/api-zod";
import { getAuth, clerkClient } from "@clerk/express";
import { db, contactNotificationSettingsTable } from "@workspace/db";
import { requireAdmin, configuredAdminEmails } from "../adminAuth";
import { getContactNotificationSettings } from "../contactNotifications";
import { gmailSmtpConfiguration } from "../gmailSmtp";

const router = Router();
const normalize = (emails: string[]) => [...new Set(emails.map(value => value.trim().toLowerCase()).filter(Boolean))];
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const settingsInput = SaveAdminContactNotificationSettingsBody.strict().refine(value =>
  Object.keys(value).length > 0 && (value.adminEmail === undefined || value.adminEmail.trim() === "" || validEmail(value.adminEmail.trim()))
  && [...value.adminEmails ?? [], ...value.orderAdminEmails ?? []].every(email => validEmail(email.trim())));

async function accountFallback(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const verified = user.emailAddresses.filter(email => email.verification?.status === "verified");
  const primary = verified.find(email => email.id === user.primaryEmailAddressId) ?? verified[0];
  const fallback = primary?.emailAddress.trim().toLowerCase() || [...configuredAdminEmails()][0] || "";
  return validEmail(fallback) ? fallback : "";
}

router.get("/admin/contact-notification-settings", requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const settings = await getContactNotificationSettings();
    res.json({
      ...settings, fallbackAdminEmail: settings.fallbackAdminEmail || await accountFallback(getAuth(req).userId!),
      gmailConfigured: Boolean(await gmailSmtpConfiguration().catch(() => null)),
    });
  } catch { res.status(503).json({ error: "Contact email settings could not be loaded." }); }
});
router.put("/admin/contact-notification-settings", requireAdmin, async (req, res) => {
  const parsed = settingsInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter valid email addresses (up to 20 per list)." });
  try {
    const saved = await getContactNotificationSettings();
    const actor = getAuth(req).userId!;
    const adminEmails = normalize(parsed.data.adminEmails ?? (parsed.data.adminEmail !== undefined
      ? parsed.data.adminEmail.trim() ? [parsed.data.adminEmail] : [] : saved.adminEmails));
    const orderAdminEmails = normalize(parsed.data.orderAdminEmails ?? saved.orderAdminEmails);
    const fallbackAdminEmail = await accountFallback(actor);
    const enabled = parsed.data.enabled ?? saved.enabled;
    const orderEnabled = parsed.data.orderEnabled ?? saved.orderEnabled;
    if ((!adminEmails.length && enabled || !orderAdminEmails.length && orderEnabled) && !fallbackAdminEmail) {
      return res.status(400).json({ error: "No verified admin account email is available. Add a recipient or verify your admin email." });
    }
    const settings: Partial<typeof contactNotificationSettingsTable.$inferInsert> & { updatedBy: string } = {
      fallbackAdminEmail, updatedBy: actor, updatedAt: new Date(),
      ...(parsed.data.adminEmails !== undefined || parsed.data.adminEmail !== undefined ? { adminEmail: adminEmails[0] ?? "", adminEmails } : {}),
      ...(parsed.data.orderAdminEmails !== undefined ? { orderAdminEmails } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled } : {}),
      ...(parsed.data.orderEnabled !== undefined ? { orderEnabled } : {}),
    };
    await db.insert(contactNotificationSettingsTable).values({ id: 1, ...settings })
      .onConflictDoUpdate({ target: contactNotificationSettingsTable.id, set: settings });
    return res.set("Cache-Control", "no-store").json(await getContactNotificationSettings());
  } catch { return res.status(503).json({ error: "Contact email settings could not be saved." }); }
});
export default router;

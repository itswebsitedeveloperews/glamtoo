import { Router, type Request } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { requireAdmin, isAdminUser } from "../adminAuth";
import { emailRecipientPolicy } from "../emailRecipientPolicy";
import { verifyGmailSmtp } from "../gmailSmtp";
import {
  GMAIL_SMTP_SCOPE, gmailOAuthClient, gmailClientBinding, oauthHash,
  encryptGmailToken, decryptGmailToken, getGmailRefreshToken, saveGmailRefreshToken,
} from "../gmailOAuthCredentials";

const router = Router();
const cookieName = "glam_gmail_oauth";
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/gmail/oauth" };
function cookieState(req: Request) {
  return req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
function sameState(left: unknown, right: unknown): left is string {
  return typeof left === "string" && typeof right === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(left) && /^[A-Za-z0-9_-]{43}$/.test(right)
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

router.get("/admin/gmail", requireAdmin, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const client = gmailOAuthClient();
    const authorization = client ? await getGmailRefreshToken(client) : null;
    res.json({
      configured: Boolean(client), connected: Boolean(authorization), authMode: "oauth2",
      callbackUrl: client?.redirectUri ?? null, scope: GMAIL_SMTP_SCOPE,
      recipientRestricted: !emailRecipientPolicy()?.allCustomers,
    });
  } catch { res.status(503).json({ error: "Gmail authorization settings could not be loaded." }); }
});

router.post("/admin/gmail/connect", requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const client = gmailOAuthClient();
  if (!client) return res.status(503).json({ error: "Configure the Google OAuth client, sender, secure storage and callback URL first." });
  if (req.headers.origin !== new URL(client.redirectUri).origin) {
    return res.status(403).json({ error: "Start Gmail authorization from this shop's admin page." });
  }
  try {
    const attempts = await pool.query(
      "SELECT COUNT(*)::int AS count FROM store_gmail_oauth_states WHERE admin_user_id = $1 AND expires_at > NOW()",
      [getAuth(req).userId],
    );
    if (attempts.rows[0].count >= 5) return res.status(429).json({ error: "Wait a few minutes before starting another Gmail authorization." });
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = Buffer.from(oauthHash(verifier), "hex").toString("base64url");
    await pool.query("DELETE FROM store_gmail_oauth_states WHERE expires_at < NOW()");
    await pool.query(
      `INSERT INTO store_gmail_oauth_states (nonce_hash, admin_user_id, encrypted_verifier, client_binding, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [oauthHash(state), getAuth(req).userId, encryptGmailToken(verifier), gmailClientBinding(client)],
    );
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: client.clientId, redirect_uri: client.redirectUri, response_type: "code",
      scope: GMAIL_SMTP_SCOPE, access_type: "offline", prompt: "consent select_account",
      code_challenge: challenge, code_challenge_method: "S256", state,
    }).toString();
    res.cookie(cookieName, state, { ...cookieOptions, maxAge: 600_000 });
    return res.json({ authorizationUrl: authorizationUrl.toString() });
  } catch { return res.status(503).json({ error: "Gmail authorization could not be started." }); }
});

router.post("/admin/gmail/verify", requireAdmin, async (req, res) => {
  const client = gmailOAuthClient();
  if (!client || req.headers.origin !== new URL(client.redirectUri).origin) {
    return res.status(403).json({ error: "Check Gmail from this shop's configured admin page." });
  }
  res.set("Cache-Control", "no-store");
  try {
    await verifyGmailSmtp();
    return res.json({ verified: true, noEmailSent: true });
  } catch { return res.status(503).json({ error: "Gmail authentication did not pass. Check Google settings or reconnect Gmail. No email was sent." }); }
});

// Google cannot supply an app bearer token. The callback is instead protected
// by a one-use persisted state, browser-only cookie, PKCE and a fresh admin-role check.
router.get("/gmail/oauth/callback", async (req, res) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  const client = gmailOAuthClient();
  if (!client) return res.status(503).send("Gmail OAuth setup is incomplete.");
  const returnTo = new URL("/admin", client.redirectUri);
  const finish = (result: string) => {
    res.clearCookie(cookieName, cookieOptions);
    returnTo.searchParams.set("gmail", result);
    return res.redirect(303, returnTo.toString());
  };
  if (!sameState(req.query.state, cookieState(req))) return finish("invalid_state");
  try {
    const result = await pool.query(
      `DELETE FROM store_gmail_oauth_states WHERE nonce_hash = $1 AND expires_at > NOW()
       RETURNING admin_user_id, encrypted_verifier, client_binding`,
      [oauthHash(req.query.state)],
    );
    const state = result.rows[0];
    if (!state || state.client_binding !== gmailClientBinding(client)) return finish("invalid_state");
    const currentUserId = getAuth(req).userId;
    if (currentUserId && currentUserId !== state.admin_user_id) return finish("invalid_state");
    const admin = await clerkClient.users.getUser(state.admin_user_id);
    if (!isAdminUser(admin)) return finish("not_authorized");
    if (req.query.error) return finish("cancelled");
    if (typeof req.query.code !== "string" || req.query.code.length > 4096) return finish("failed");
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId, client_secret: client.clientSecret, code: req.query.code,
        redirect_uri: client.redirectUri, grant_type: "authorization_code",
        code_verifier: decryptGmailToken(state.encrypted_verifier),
      }),
    });
    if (!exchange.ok) return finish("failed");
    const token = await exchange.json() as { access_token?: string; refresh_token?: string; scope?: string };
    if (!token.access_token || !token.refresh_token || !token.scope?.split(" ").includes(GMAIL_SMTP_SCOPE)) return finish("missing_permission");
    const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profile.ok) return finish("failed");
    const mailbox = await profile.json() as { emailAddress?: string };
    if (mailbox.emailAddress?.toLowerCase() !== client.user.toLowerCase()) return finish("wrong_mailbox");
    // Authenticate SMTP before saving; this sends no email.
    await verifyGmailSmtp({
      user: client.user, mode: "oauth2", clientId: client.clientId, clientSecret: client.clientSecret,
      refreshToken: token.refresh_token, fromName: "Glam Too Boutique", replyTo: client.user,
    });
    await saveGmailRefreshToken(client, token.refresh_token, state.admin_user_id);
    return finish("connected");
  } catch {
    // Never log exceptions containing Google responses, codes or tokens.
    req.log?.warn("Gmail OAuth authorization could not be completed.");
    return finish("failed");
  }
});
export default router;

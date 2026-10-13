import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";

export const GMAIL_SMTP_SCOPE = "https://mail.google.com/";
export function gmailUsesOAuth() {
  if (process.env.GMAIL_SMTP_AUTH_MODE === "app_password") return false;
  return process.env.GMAIL_SMTP_AUTH_MODE === "oauth2"
    || Boolean(process.env.GMAIL_SMTP_CLIENT_ID || process.env.GMAIL_SMTP_CLIENT_SECRET);
}
export function gmailOAuthClient() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const clientId = process.env.GMAIL_SMTP_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_SMTP_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_SMTP_OAUTH_REDIRECT_URI?.trim()
    || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/gmail/oauth/callback` : "");
  if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || !clientId || !clientSecret || !process.env.SESSION_SECRET) return null;
  try {
    const uri = new URL(redirectUri);
    if (uri.protocol !== "https:" || uri.username || uri.password || uri.search || uri.hash
      || uri.pathname !== "/api/gmail/oauth/callback") return null;
  } catch { return null; }
  return { user, clientId, clientSecret, redirectUri };
}
export function oauthHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function gmailClientBinding(client: { user: string; clientId: string; clientSecret: string }) {
  return oauthHash(JSON.stringify([client.user.toLowerCase(), client.clientId, client.clientSecret]));
}
function encryptionKey() {
  if (!process.env.SESSION_SECRET) throw new Error("Secure Gmail authorization storage is unavailable.");
  return createHash("sha256").update("gmail-oauth-storage-v1:").update(process.env.SESSION_SECRET).digest();
}
export function encryptGmailToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function decryptGmailToken(value: string) {
  try {
    const [version, iv, tag, data] = value.split(".");
    if (version !== "v1" || !iv || !tag || !data) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
  } catch { throw new Error("Saved Gmail authorization cannot be read; reconnect Gmail."); }
}
export async function getGmailRefreshToken(client: NonNullable<ReturnType<typeof gmailOAuthClient>>) {
  try {
    const result = await pool.query("SELECT encrypted_refresh_token, client_binding, enabled_at FROM store_gmail_oauth_credentials WHERE id = 1");
    const record = result.rows[0];
    return record?.client_binding === gmailClientBinding(client)
      ? { token: decryptGmailToken(record.encrypted_refresh_token), enabledAt: new Date(record.enabled_at) } : null;
  } catch { throw new Error("Gmail authorization storage is unavailable; check setup or reconnect Gmail."); }
}
export async function saveGmailRefreshToken(client: NonNullable<ReturnType<typeof gmailOAuthClient>>, refreshToken: string, adminUserId: string) {
  await pool.query(
    `INSERT INTO store_gmail_oauth_credentials (id, encrypted_refresh_token, client_binding, updated_by)
     VALUES (1, $1, $2, $3) ON CONFLICT (id) DO UPDATE SET encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
     enabled_at = CASE WHEN store_gmail_oauth_credentials.client_binding = EXCLUDED.client_binding
       THEN store_gmail_oauth_credentials.enabled_at ELSE NOW() END,
     client_binding = EXCLUDED.client_binding, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [encryptGmailToken(refreshToken), gmailClientBinding(client), adminUserId],
  );
}

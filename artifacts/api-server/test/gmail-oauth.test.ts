import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import router from "../src/routes/gmailOAuth";
import { gmailSmtpConfiguration, sendGmailConfirmation } from "../src/gmailSmtp";
import { gmailOAuthClient, getGmailRefreshToken, oauthHash, GMAIL_SMTP_SCOPE } from "../src/gmailOAuthCredentials";
import * as database from "./fixtures/gmail-oauth-db";
import { resetSmtp, smtpCalls, smtpConnections, setSmtpFailure } from "./fixtures/gmail-smtp";
import { setAdminRevoked } from "./fixtures/gmail-oauth-clerk";

let server: Server;
let origin: string;
let providerCalls = 0;
let wrongMailbox = false;
let wrongScope = false;
let rejectExchange = false;
const nativeFetch = globalThis.fetch;
const sender = "sender@example.test";
before(async () => {
  Object.assign(process.env, {
    GMAIL_SMTP_USER: sender, GMAIL_SMTP_AUTH_MODE: "oauth2",
    GMAIL_SMTP_CLIENT_ID: "isolated-client.apps.googleusercontent.com",
    GMAIL_SMTP_CLIENT_SECRET: "isolated-client-secret", SESSION_SECRET: "isolated-encryption-key",
    ORDER_EMAIL_ALLOWED_RECIPIENTS: "controlled@example.test", ORDER_EMAIL_SEND_TO_ALL: "false",
  });
  delete process.env.ADMIN_EMAILS;
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.GMAIL_SMTP_OAUTH_REDIRECT_URI = "https://shop.example.test/api/gmail/oauth/callback";
  globalThis.fetch = async (url: any, init?: any) => {
    if (String(url).startsWith(origin)) return nativeFetch(url, init);
    providerCalls++;
    if (String(url) === "https://oauth2.googleapis.com/token") {
      assert.equal(new URLSearchParams(init.body).get("code_verifier")?.length, 64);
      return new Response(JSON.stringify(rejectExchange ? { error: "isolated-client-secret isolated-refresh-token" } : {
        access_token: "isolated-access-token", refresh_token: "isolated-refresh-token",
        scope: wrongScope ? "https://www.googleapis.com/auth/gmail.send" : GMAIL_SMTP_SCOPE,
      }), { status: rejectExchange ? 400 : 200 });
    }
    if (String(url) === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
      return new Response(JSON.stringify({ emailAddress: wrongMailbox ? "other@example.test" : sender }));
    }
    throw new Error("Unexpected external request in isolated OAuth tests.");
  };
});
beforeEach(() => {
  database.resetOAuthDb(); resetSmtp(); setAdminRevoked(false);
  providerCalls = 0; wrongMailbox = wrongScope = rejectExchange = false;
  process.env.GMAIL_SMTP_USER = sender;
});
after(async () => { globalThis.fetch = nativeFetch; await new Promise<void>(resolve => server.close(() => resolve())); });
async function request(path: string, method = "GET", user = "oauth-admin", cookie?: string, requestOrigin = "https://shop.example.test") {
  return nativeFetch(`${origin}/api${path}`, {
    method, redirect: "manual", headers: { "x-test-user": user, Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) },
  });
}
async function begin() {
  const response = await request("/admin/gmail/connect", "POST");
  assert.equal(response.status, 200);
  const payload = await response.json();
  const url = new URL(payload.authorizationUrl);
  return { state: url.searchParams.get("state")!, cookie: response.headers.get("set-cookie")!.split(";")[0], url, cookieHeader: response.headers.get("set-cookie")! };
}
async function complete(flow: Awaited<ReturnType<typeof begin>>, extra = "&code=isolated-code") {
  return request(`/gmail/oauth/callback?state=${flow.state}${extra}`, "GET", "", flow.cookie);
}
test("only administrators can inspect, connect or verify Gmail", async () => {
  for (const [path, method] of [["/admin/gmail", "GET"], ["/admin/gmail/connect", "POST"], ["/admin/gmail/verify", "POST"]]) {
    assert.equal((await request(path, method, "")).status, 401);
    assert.equal((await request(path, method, "customer")).status, 403);
  }
  assert.equal(providerCalls, 0);
});
test("client credentials alone do not configure SMTP or reveal secrets", async () => {
  assert.equal(await gmailSmtpConfiguration(), null);
  const response = await request("/admin/gmail");
  const text = await response.text();
  assert.equal(JSON.parse(text).configured, true);
  assert.equal(JSON.parse(text).connected, false);
  for (const value of ["isolated-client-secret", sender, "isolated-refresh-token"]) assert.equal(text.includes(value), false);
});
test("authorization requires matching origin and uses secure cookie, PKCE and full SMTP scope", async () => {
  assert.equal((await request("/admin/gmail/connect", "POST", "oauth-admin", undefined, "https://foreign.example")).status, 403);
  const flow = await begin();
  assert.equal(flow.url.searchParams.get("scope"), GMAIL_SMTP_SCOPE);
  assert.equal(flow.url.searchParams.get("access_type"), "offline");
  assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
  assert.match(flow.cookieHeader, /HttpOnly/); assert.match(flow.cookieHeader, /Secure/); assert.match(flow.cookieHeader, /SameSite=Lax/);
  const state = database.states.get(oauthHash(flow.state));
  assert.equal(state.encrypted_verifier.startsWith("v1."), true);
  assert.equal(providerCalls, 0);
});
test("missing cookie, mismatched state and expired states cannot exchange credentials", async () => {
  const flow = await begin();
  assert.match((await request(`/gmail/oauth/callback?state=${flow.state}&code=x`)).headers.get("location")!, /invalid_state/);
  assert.match((await request(`/gmail/oauth/callback?state=${"x".repeat(43)}&code=x`, "GET", "", flow.cookie)).headers.get("location")!, /invalid_state/);
  database.states.get(oauthHash(flow.state)).expires_at = new Date(0);
  assert.match((await complete(flow)).headers.get("location")!, /invalid_state/);
  assert.equal(providerCalls, 0);
});
test("admin-role revocation and cancellation prevent authorization", async () => {
  const revoked = await begin(); setAdminRevoked(true);
  assert.match((await complete(revoked)).headers.get("location")!, /not_authorized/);
  setAdminRevoked(false);
  assert.match((await complete(await begin(), "&error=access_denied")).headers.get("location")!, /cancelled/);
  assert.equal(providerCalls, 0);
});
test("wrong mailbox and missing SMTP permission cannot save a token", async () => {
  wrongMailbox = true;
  assert.match((await complete(await begin())).headers.get("location")!, /wrong_mailbox/);
  wrongMailbox = false; wrongScope = true;
  assert.match((await complete(await begin())).headers.get("location")!, /missing_permission/);
  assert.equal(database.authorization, null);
  assert.equal(smtpConnections.length, 0);
});
test("successful authorization encrypts token, verifies SMTP without sending, and cannot replay", async () => {
  const flow = await begin();
  const response = await complete(flow);
  assert.match(response.headers.get("location")!, /gmail=connected/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(database.authorization.encrypted_refresh_token.includes("isolated-refresh-token"), false);
  assert.equal(smtpCalls.length, 0);
  assert.equal(smtpConnections[0].options.auth.type, "OAuth2");
  assert.equal(smtpConnections[0].options.auth.pass, undefined);
  const config = (await gmailSmtpConfiguration())!;
  assert.equal(config.refreshToken, "isolated-refresh-token");
  assert.ok(config.authorizedSince instanceof Date);
  const count = providerCalls;
  assert.match((await complete(flow)).headers.get("location")!, /invalid_state/);
  assert.equal(providerCalls, count);
  await sendGmailConfirmation(config, { id: "isolated-oauth-order", email: "controlled@example.test" }, { subject: "Isolated test", html: "<p>Test</p>", text: "Test" });
  assert.equal(smtpCalls.length, 1);
});
test("mailbox/client changes invalidate saved authorization and never use App Password fallback", async () => {
  await complete(await begin());
  process.env.GMAIL_SMTP_USER = "changed@example.test";
  process.env.GMAIL_SMTP_APP_PASSWORD = "must-not-be-used";
  assert.equal(await gmailSmtpConfiguration(), null);
  assert.equal(await getGmailRefreshToken(gmailOAuthClient()!), null);
});
test("provider and SMTP failures are sanitized and do not persist credentials", async () => {
  rejectExchange = true;
  const exchange = await complete(await begin());
  assert.match(exchange.headers.get("location")!, /gmail=failed/);
  assert.equal((await exchange.text()).includes("isolated-client-secret"), false);
  rejectExchange = false; setSmtpFailure({ code: "EAUTH", responseCode: 535, message: "isolated-refresh-token" });
  assert.match((await complete(await begin())).headers.get("location")!, /gmail=failed/);
  assert.equal(database.authorization, null);
  assert.equal(smtpCalls.length, 0);
});
test("authentication check sends no email and reconnect keeps first activation cutoff", async () => {
  await complete(await begin());
  const first = database.authorization.enabled_at;
  await complete(await begin());
  assert.equal(database.authorization.enabled_at, first);
  const response = await request("/admin/gmail/verify", "POST");
  assert.deepEqual(await response.json(), { verified: true, noEmailSent: true });
  assert.equal(smtpCalls.length, 0);
});
test("pending authorizations are bounded", async () => {
  for (let i = 0; i < 5; i++) await begin();
  assert.equal((await request("/admin/gmail/connect", "POST")).status, 429);
});

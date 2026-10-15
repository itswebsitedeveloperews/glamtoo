import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { CLERK_PROXY_PATH, createClerkProxyHandler, clerkProxyMiddleware } from "../src/middlewares/clerkProxyMiddleware";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test("Clerk proxy preserves mounted paths, bodies, headers and response framing", async t => {
  // Only invented test configuration; never read provider credentials.
  const previousOrigin = process.env.TRUSTED_BROWSER_ORIGINS;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.TRUSTED_BROWSER_ORIGINS = "https://shop.example";
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousOrigin === undefined) delete process.env.TRUSTED_BROWSER_ORIGINS;
    else process.env.TRUSTED_BROWSER_ORIGINS = previousOrigin;
  });
  const seen: Array<{ url: string | undefined; method: string | undefined; body: string }> = [];
  const upstream = createServer(async (req, res) => {
    assert.equal(req.headers["clerk-secret-key"], "test-only-placeholder");
    assert.equal(req.headers["clerk-proxy-url"], `https://shop.example${CLERK_PROXY_PATH}`);
    assert.match(String(req.headers["x-forwarded-for"]), /127\.0\.0\.1/);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    seen.push({ url: req.url, method: req.method, body: Buffer.concat(chunks).toString() });
    res.setHeader("set-cookie", ["one=1; HttpOnly", "two=2; Secure"]);
    if (req.url === "/empty") { res.writeHead(204); res.end(); }
    else if (req.url === "/cached") { res.writeHead(304); res.end(); }
    else if (req.url === "/redirect") { res.writeHead(302, { location: "/next" }); res.end(); }
    else if (req.url === "/fixed" || req.method === "HEAD") {
      res.writeHead(200, { "content-length": "5" }); res.end("fixed");
    } else {
      res.writeHead(201, { "content-type": "application/json" });
      res.write('{"ok":'); res.end("true}");
    }
  });
  const target = await listen(upstream);
  t.after(() => close(upstream));
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkProxyHandler(target, "test-only-placeholder"));
  const server = createServer(app);
  const origin = await listen(server);
  t.after(() => close(server));
  const response = await fetch(`${origin}${CLERK_PROXY_PATH}/v1/client?x=1`, {
    method: "POST", body: '{"input":"value"}', headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(response.headers.get("content-length"), "11");
  assert.equal(response.headers.get("transfer-encoding"), null);
  assert.deepEqual(response.headers.getSetCookie(), ["one=1; HttpOnly", "two=2; Secure"]);
  assert.deepEqual(seen[0], { url: "/v1/client?x=1", method: "POST", body: '{"input":"value"}' });
  const fixed = await fetch(`${origin}${CLERK_PROXY_PATH}/fixed`);
  assert.equal(await fixed.text(), "fixed");
  for (const [path, status] of [["empty", 204], ["cached", 304]] as const) {
    const result = await fetch(`${origin}${CLERK_PROXY_PATH}/${path}`);
    assert.equal(result.status, status);
    assert.equal(await result.text(), "");
  }
  const head = await fetch(`${origin}${CLERK_PROXY_PATH}/fixed`, { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "5");
  assert.equal(await head.text(), "");
  const redirect = await fetch(`${origin}${CLERK_PROXY_PATH}/redirect`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "/next");
  // Same real HTTP handler, with the upstream unavailable.
  await close(upstream);
  const failed = await fetch(`${origin}${CLERK_PROXY_PATH}/v1/client`);
  assert.equal(failed.status, 502);
  assert.equal(await failed.text(), "");
});

test("development still bypasses the Clerk production proxy", () => {
  // This branch returns before reading a secret or contacting the provider.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    let passed = false;
    clerkProxyMiddleware()({} as never, {} as never, () => { passed = true; });
    assert.equal(passed, true);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "lib/db/package.json"));
const { Pool } = require("pg");
// Never fall back to DATABASE_URL: it may point at the running shop.
if (!process.env.TEST_DATABASE_ADMIN_URL) throw new Error("BLOCKED: TEST_DATABASE_ADMIN_URL must explicitly name a disposable local PostgreSQL cluster. Run pnpm validate:linux to provision one automatically.");
const testUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(testUrl.hostname)) {
  throw new Error("BLOCKED: isolated regressions require a disposable loopback PostgreSQL cluster.");
}
const database = `glam_checkout_test_${randomUUID().replace(/-/g, "")}`;
const admin = new Pool({ connectionString: testUrl.toString() });
testUrl.pathname = `/${database}`;
const env = {
  ...Object.fromEntries(["PATH", "HOME", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE"].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
  DATABASE_URL: testUrl.toString(), NODE_ENV: "test",
  ORDER_EMAIL_DELIVERY_ENABLED: "false", ORDER_EMAIL_SEND_TO_ALL: "false", ORDER_EMAIL_ALLOWED_RECIPIENTS: "",
};
// Providers are mocked by build.mjs and no provider verification script runs.
async function run(args) {
  await new Promise((accept, reject) => {
    const child = spawn("pnpm", args, { cwd: root, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? accept() : reject(new Error(`Isolated check failed (exit ${code}).`)));
  });
}
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  await run(["--filter", "@workspace/db", "run", "push-force"]);
  const suites = process.argv.slice(2);
  for (const suite of suites.length ? suites : ["regressions", "listing-preview-warmup", "guest-checkout", "checkout-safety", "email-confirmations", "gmail-smtp", "gmail-oauth", "shipping", "contact-notifications", "contact-email-template", "order-email-status", "order-email-actions", "customer-confirmation-policy", "order-confirmation-template", "fresh-launch"]) {
    await run(["--filter", "@workspace/api-server", "exec", "node", "test/build.mjs", suite]);
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
}

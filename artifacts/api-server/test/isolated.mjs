import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "lib/db/package.json"));
const { Pool } = require("pg");
if (!process.env.DATABASE_URL) throw new Error("A development PostgreSQL connection is required for isolated tests.");
const database = `glam_checkout_test_${randomUUID().replace(/-/g, "")}`;
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.pathname = `/${database}`;
const env = {
  ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test",
  ORDER_EMAIL_DELIVERY_ENABLED: "false", ORDER_EMAIL_ALLOWED_RECIPIENTS: "",
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
  for (const suite of suites.length ? suites : ["regressions", "guest-checkout", "checkout-safety", "email-confirmations", "gmail-smtp", "gmail-oauth", "shipping"]) {
    await run(["--filter", "@workspace/api-server", "exec", "node", "test/build.mjs", suite]);
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
}

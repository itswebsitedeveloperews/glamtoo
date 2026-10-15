import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(testDir, ".compiled");
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.NODE_ENV !== "test" || !databaseUrl
    || !["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname)
    || !/^\/glam_checkout_test_[a-f0-9]{32}$/.test(databaseUrl.pathname)) {
  throw new Error("BLOCKED: backend test builds require the disposable local database runner. Use test:isolated or pnpm validate:linux.");
}
const testName = ["listing-preview-warmup", "shipping", "guest-checkout", "checkout-safety", "email-confirmations", "gmail-smtp", "gmail-oauth", "contact-notifications", "contact-email-template", "order-email-status", "order-email-actions", "customer-confirmation-policy", "order-confirmation-template", "fresh-launch"].includes(process.argv[2]) ? process.argv[2] : "regressions";
const outputFile = resolve(outputDir, `${testName}.test.cjs`);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [resolve(testDir, `${testName}.test.ts`)],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: outputFile,
  sourcemap: "inline",
  loader: { ".png": "base64" },
  plugins: testName === "listing-preview-warmup" ? [{
    name: "isolated-listing-storage",
    setup(builder) {
      builder.onResolve({ filter: /\/objectStorage$/ }, () => ({ path: resolve(testDir, "fixtures/listing-storage.ts") }));
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: resolve(testDir, "fixtures/gmail-oauth-clerk.ts") }));
    },
  }] : ["guest-checkout", "checkout-safety"].includes(testName) ? [{
    name: "isolated-guest-payment-provider",
    setup(builder) {
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk-test", namespace: "guest-checkout" }));
      builder.onResolve({ filter: /^\.\.\/stripeClient$/ }, () => ({ path: "stripe-test", namespace: "guest-checkout" }));
      builder.onResolve({ filter: /^\.\.\/orderService$/ }, (args) => testName === "guest-checkout" && args.importer.endsWith("/routes/stripe.ts") ? ({ path: "order-test", namespace: "guest-checkout" }) : undefined);
      builder.onResolve({ filter: /^\.\/webhookHandlers$/ }, () => ({ path: "webhook-test", namespace: "guest-checkout" }));
      builder.onLoad({ filter: /.*/, namespace: "guest-checkout" }, (args) => ({
        contents: args.path === "clerk-test"
          ? `import {fakeClerk} from ${JSON.stringify(resolve(testDir, "fixtures/guest-clerk.ts"))}; export const getAuth = req => ({userId: req.headers["x-test-user"] || null}); export const clerkClient = fakeClerk; export const clerkMiddleware = ()=> (_req,_res,next)=>next();`
          : args.path === "stripe-test"
            ? `import {fakeStripe} from ${JSON.stringify(resolve(testDir, "fixtures/guest-stripe.ts"))}; export const getUncachableStripeClient = async()=>fakeStripe; export const getStripeConnectionInfoWithSource = async()=>{throw Error("Unused in isolated checkout tests")}; export const getStripeSync = async()=>{throw Error("Unused in isolated checkout tests")};`
            : args.path === "webhook-test"
              ? `export const WebhookHandlers={async processWebhook(body,signature){ if(!Buffer.isBuffer(body)||signature!=="isolated-signed") throw Error("invalid test webhook"); }};`
              : `export * from ${JSON.stringify(resolve(testDir, "../src/orderService.ts"))}; export const listExpiredPendingPayments = async()=>[];`,
        loader: "ts",
        resolveDir: testDir,
      }));
    },
  }] : ["gmail-smtp", "gmail-oauth", "contact-notifications", "order-email-actions"].includes(testName) ? [{
    name: "isolated-gmail-smtp",
    setup(builder) {
      builder.onResolve({ filter: /^nodemailer$/ }, () => ({ path: resolve(testDir, "fixtures/gmail-smtp.ts") }));
      if (testName === "gmail-oauth") {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: resolve(testDir, "fixtures/gmail-oauth-db.ts") }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: resolve(testDir, "fixtures/gmail-oauth-clerk.ts") }));
      }
      if (["contact-notifications", "order-email-actions"].includes(testName)) {
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: resolve(testDir, "fixtures/gmail-oauth-clerk.ts") }));
      }
    },
  }] : [],
  external: [
    "sharp",
    "stripe",
    "stripe-replit-sync",
    "express",
    "cors",
    "pino",
    "pino-http",
    "pino-pretty",
    "@clerk/express",
    "@clerk/shared",
    "cookie-parser",
    "httpxy",
  ],
});

await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, ["--test", "--test-timeout=60000", outputFile], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`Node test process exited with ${code ?? signal}`));
  });
});
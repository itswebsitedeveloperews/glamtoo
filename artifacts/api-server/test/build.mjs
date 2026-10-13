import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(testDir, ".compiled");
const testName = ["shipping", "guest-checkout"].includes(process.argv[2]) ? process.argv[2] : "regressions";
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
  plugins: testName === "guest-checkout" ? [{
    name: "isolated-guest-payment-provider",
    setup(builder) {
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk-test", namespace: "guest-checkout" }));
      builder.onResolve({ filter: /^\.\.\/stripeClient$/ }, () => ({ path: "stripe-test", namespace: "guest-checkout" }));
      builder.onResolve({ filter: /^\.\.\/orderService$/ }, (args) => args.importer.endsWith("/routes/stripe.ts") ? ({ path: "order-test", namespace: "guest-checkout" }) : undefined);
      builder.onLoad({ filter: /.*/, namespace: "guest-checkout" }, (args) => ({
        contents: args.path === "clerk-test"
          ? `export const getAuth = req => ({userId: req.headers["x-test-user"] || null}); export const clerkClient = {};`
          : args.path === "stripe-test"
            ? `import {fakeStripe} from ${JSON.stringify(resolve(testDir, "fixtures/guest-stripe.ts"))}; export const getUncachableStripeClient = async()=>fakeStripe; export const getStripeConnectionInfoWithSource = async()=>{throw Error("Unused in isolated checkout tests")}; export const getStripeSync = async()=>{throw Error("Unused in isolated checkout tests")};`
            : `export * from ${JSON.stringify(resolve(testDir, "../src/orderService.ts"))}; export const listExpiredPendingPayments = async()=>[];`,
        loader: "ts",
        resolveDir: testDir,
      }));
    },
  }] : [],
  external: [
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
    "http-proxy-middleware",
  ],
});

await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, ["--test", outputFile], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`Node test process exited with ${code ?? signal}`));
  });
});
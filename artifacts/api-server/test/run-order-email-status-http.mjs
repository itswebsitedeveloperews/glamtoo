import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const testDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(testDir, ".compiled");
const output = resolve(outputDir, "order-email-status-http.test.mjs");
const fixture = resolve(testDir, "fixtures/order-email-status-http.ts");
const dbRequire = createRequire(resolve(testDir, "../../../lib/db/package.json"));
await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [resolve(testDir, "order-email-status-http.test.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  loader: { ".png": "base64" },
  plugins: [{
    name: "read-only-status-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^(pg|drizzle-zod|zod)$/ }, (args) => ({ path: dbRequire.resolve(args.path), external: true }));
      builder.onResolve({ filter: /^@workspace\/(db|shipping|api-zod)$/ }, (args) => ({
        path: resolve(testDir, "../../../lib", args.path.slice("@workspace/".length), "src/index.ts"),
      }));
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "status-test" }));
      builder.onResolve({ filter: /^\.\.\/orderEmailStatus$/ }, (args) =>
        args.importer.endsWith("/src/routes/stripe.ts") ? { path: "status", namespace: "status-test" } : undefined);
      builder.onResolve({ filter: /^\.\.\/customerEmailRetry$/ }, (args) =>
        args.importer.endsWith("/src/routes/customerEmailRetry.ts") ? { path: "approval", namespace: "status-test" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "status-test" }, (args) => ({
        loader: "ts",
        resolveDir: testDir,
        contents: `import {statusHttpFixture as f, statusHttpPayload as payload} from ${JSON.stringify(fixture)};
${args.path === "clerk" ? `
export const getAuth = () => ({userId:f.access === "anonymous" ? null : "user_http_fixture"});
export const clerkClient = {users:{getUser:async()=>{
  if(f.access === "unavailable") throw Error("private credential sentinel; must not be returned");
  return {emailAddresses:[], privateMetadata:{role:f.access === "admin" ? "admin" : "customer"}};
}}};
export const clerkMiddleware = () => (_req,_res,next)=>next();
` : args.path === "approval" ? `
export class CustomerEmailRetryError extends Error { constructor(status,message){super(message);this.status=status;} }
export async function approveCustomerEmailRetry(reference,actor) {
  f.approvals.push({reference,actor});
  if(f.result === "unavailable") throw Error("private credential sentinel; must not be returned");
  if(f.result === "missing") throw new CustomerEmailRetryError(404,"Order not found.");
  return {outcome:"approved",message:"One saved confirmation approved."};
}
` : `
export async function getOrderEmailStatus(reference) {
  f.references.push(reference);
  if(f.result === "unavailable") throw Error("private credential sentinel; must not be returned");
  return f.result === "missing" ? null : payload;
}
`}`,
      }));
    },
  }],
});
// Strip all inherited credentials. Even an accidental unrelated database query
// can reach only an unused loopback port, never the running shop's database.
const env = Object.fromEntries(
  ["PATH", "HOME", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
Object.assign(env, {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/status_http_unused?connect_timeout=1",
  TRUSTED_BROWSER_ORIGINS: "https://shop.example.test",
});
await new Promise((accept, reject) => {
  const child = spawn(process.execPath, ["--test", "--test-timeout=20000", output], { env, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? accept() : reject(new Error(`Status HTTP tests failed (${code}).`)));
});

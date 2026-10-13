import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(testDir, ".compiled");
const testName = process.argv[2] === "shipping" ? "shipping" : "regressions";
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
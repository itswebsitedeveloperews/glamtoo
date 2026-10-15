// Clean Linux validation. No workspace credentials or database URLs are inherited.
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("BLOCKED: validation requires Linux x64 (glibc).");
}
for (const command of ["pnpm", "initdb", "pg_ctl"]) {
  if (spawnSync("sh", ["-c", `command -v ${command}`]).status !== 0) {
    throw new Error(`BLOCKED: install ${command} before running Linux validation.`);
  }
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
console.log(`Linux validation: Node ${process.version}; ${process.platform}/${process.arch}; ${new Date().toISOString()}`);
console.log(`Lockfile SHA256: ${createHash("sha256").update(await readFile(join(root, "pnpm-lock.yaml"))).digest("hex")}`);
const temp = await mkdtemp(join(tmpdir(), "glam-readiness-"));
const work = join(temp, "workspace");
const evidence = join(root, "generated-artifacts/readiness/linux");
await mkdir(work);
await mkdir(evidence, { recursive: true });
const env = Object.fromEntries(["PATH", "HOME", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, {
  CI: "true", NODE_ENV: "test",
  ORDER_EMAIL_DELIVERY_ENABLED: "false", ORDER_EMAIL_SEND_TO_ALL: "false",
  ORDER_EMAIL_ALLOWED_RECIPIENTS: "",
});
async function run(command, args, options = {}) {
  console.log(`CHECK: ${command} ${args.join(" ")}`);
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: work, env, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? accept() : reject(new Error(`FAILED: ${command} (exit ${code ?? signal})`)));
  });
}
let postgresStarted = false;
try {
  // Copy only build inputs, not existing dependencies, declarations or local secrets.
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json", "artifacts", "lib", "scripts", "attached_assets"]) {
    await cp(join(root, name), join(work, name), {
      recursive: true,
      filter: (path) => !path.split("/").some((part) => ["node_modules", "dist", ".compiled", ".git", ".replit-artifact"].includes(part) || part === ".env" || part.startsWith(".env."))
        && !/\.(tsbuildinfo|zip)$/.test(path),
    });
  }
  await run("pnpm", ["install", "--frozen-lockfile"]);
  await run("pnpm", ["run", "typecheck"]);
  // Each artifact receives its actual build-time routing inputs. These are not secrets.
  for (const [name, port, base] of [["api-server", "8080", "/api"], ["glam-me", "5173", "/"], ["mockup-sandbox", "5174", "/__mockup/"]]) {
    await run("pnpm", ["--filter", `@workspace/${name}`, "run", "build"], {
      env: { ...env, NODE_ENV: "production", PORT: port, BASE_PATH: base },
    });
  }
  await run("pnpm", ["--filter", "@workspace/glam-me", "run", "test:seo"]);
  await run("pnpm", ["--filter", "@workspace/glam-me", "run", "test:storefront"]);
  await run("pnpm", ["--filter", "@workspace/shipping", "run", "test"]);
  await run("node", ["--test", "scripts/test-dependency-security.mjs"]);
  await run("pnpm", ["--filter", "@workspace/api-server", "run", "test:clerk-proxy"]);
  await run("pnpm", ["--filter", "@workspace/api-server", "run", "test:listing-preview"]);

  // Own the entire cluster, not merely a schema on a potentially live server.
  const data = join(temp, "postgres");
  await run("initdb", ["-D", data, "-A", "trust", "-U", "readiness", "--no-locale", "--encoding=UTF8"]);
  const port = await new Promise((accept, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => accept(value));
    });
  });
  await run("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${temp}`, "-w", "start"]);
  postgresStarted = true;
  await run("pnpm", ["--filter", "@workspace/api-server", "run", "test:isolated"], {
    env: { ...env, TEST_DATABASE_ADMIN_URL: `postgresql://readiness@127.0.0.1:${port}/postgres` },
  });
  await cp(join(work, "artifacts/glam-me/dist/public"), join(evidence, "storefront-build"), { recursive: true });
  console.log("PASS: frozen install, declarations, workspace types, production builds and isolated regressions.");
} finally {
  if (postgresStarted) await run("pg_ctl", ["-D", join(temp, "postgres"), "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}

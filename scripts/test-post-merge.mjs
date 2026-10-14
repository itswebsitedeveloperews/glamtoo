// Focused setup regression against an owned, disposable PostgreSQL cluster.
// Never inherit DATABASE_URL, storage credentials or provider configuration.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "glam-merge-"));
const data = join(temp, "postgres");
const env = Object.fromEntries(
  ["PATH", "HOME", "NIX_SSL_CERT_FILE", "SSL_CERT_FILE"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]),
);
env.CI = "true";
env.NODE_ENV = "test";
// Retain the already-installed package store without inheriting app secrets.
// Dropping the workspace's package-manager config otherwise forces a reinstall.
const store = spawnSync("pnpm", ["store", "path"], { cwd: root, encoding: "utf8" });
assert.equal(store.status, 0, "pnpm store path must resolve");
env.npm_config_store_dir = dirname(store.stdout.trim());
function run(command, args, timeout = 30000) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout });
  assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const port = await new Promise((accept, reject) => {
  const server = net.createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => accept(port));
  });
});
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "-U", "merge_test", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${temp}`, "-w", "start"]);
  started = true;
  env.DATABASE_URL = `postgresql://merge_test@127.0.0.1:${port}/postgres`;
  const sql = query => run("psql", [env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-Atc", query]).trim();

  // Both executions have the same 20s limit as the configured post-merge hook.
  run("bash", ["scripts/post-merge.sh"], 20000);
  assert.equal(sql("SELECT count(*) FROM store_catalog"), "0", "fresh setup must not require or seed catalog row 1");
  console.log("PASS: post-merge succeeds on a fresh database without gallery repair.");

  sql(`INSERT INTO store_catalog(id, products, categories)
    VALUES (1, '[{"id":109,"name":"Merchant edited title","galleryImages":[]}]', '[]')`);
  const before = sql("SELECT row_to_json(c)::text FROM store_catalog c WHERE id = 1");
  run("bash", ["scripts/post-merge.sh"], 20000);
  assert.equal(sql("SELECT row_to_json(c)::text FROM store_catalog c WHERE id = 1"), before);
  assert.equal(sql("SELECT count(*) FROM catalog_gallery_repairs"), "0", "setup must not execute a data repair");
  console.log("PASS: post-merge succeeds with intervening merchant edits and leaves catalog data unchanged.");
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}

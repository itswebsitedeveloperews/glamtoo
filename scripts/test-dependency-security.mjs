import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const apiRequire = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const canvasRequire = createRequire(new URL("../artifacts/mockup-sandbox/package.json", import.meta.url));
const storeRequire = createRequire(new URL("../artifacts/glam-me/package.json", import.meta.url));

test("Google storage consumers receive a CommonJS-compatible UUID with bounds guards", () => {
  // Resolve through each consumer, not an unrelated top-level UUID.
  const storageRequire = createRequire(apiRequire.resolve("@google-cloud/storage"));
  for (const consumer of ["gaxios", "teeny-request"]) {
    const consumerRequire = createRequire(storageRequire.resolve(consumer));
    const uuid = consumerRequire("uuid");
    assert.equal(uuid.validate(uuid.v4()), true);
    assert.equal(uuid.v5("hello", uuid.v5.DNS), "9342d47a-1bab-5709-9869-c840b2eac501");
    assert.throws(() => uuid.v5("hello", uuid.v5.DNS, new Uint8Array(8), 4), RangeError);
  }
});

test("typography uses the patched selector parser without changing selector output", () => {
  const typographyRequire = createRequire(storeRequire.resolve("@tailwindcss/typography"));
  const parser = typographyRequire("postcss-selector-parser");
  assert.equal(typographyRequire("postcss-selector-parser/package.json").version, "7.1.6");
  const selector = ".prose :where(p, a[href]):not(:where(.not-prose, .not-prose *))";
  assert.equal(parser().processSync(selector), selector);
  const flat = ".a".repeat(20000);
  assert.equal(parser().processSync(flat), flat);
});

test("Canvas discovery includes nested TSX files and excludes private helpers", async () => {
  const { glob } = canvasRequire("tinyglobby");
  const root = await mkdtemp(join(tmpdir(), "glam-glob-"));
  try {
    await mkdir(join(root, "src/components/mockups/nested"), { recursive: true });
    await mkdir(join(root, "src/components/mockups/_private"), { recursive: true });
    for (const file of ["Card.tsx", "_helper.tsx", "nested/Deep.tsx", "_private/Secret.tsx", "notes.ts"]) {
      await writeFile(join(root, "src/components/mockups", file), "");
    }
    assert.deepEqual((await glob("src/components/mockups/**/*.tsx", {
      cwd: root, ignore: ["**/_*/**", "**/_*.tsx"],
    })).sort(), ["src/components/mockups/Card.tsx", "src/components/mockups/nested/Deep.tsx"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Read-only measurement against an existing PUBLIC upload; never edits the catalog.
// Usage: pnpm --filter @workspace/glam-me exec node test/measure-uploaded-preview.mjs <upload UUID>
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const id = process.argv[2];
assert.match(id ?? "", /^[0-9a-f-]{36}$/);
const base = process.env.STOREFRONT_BASE_URL || "http://localhost:80";
const original = `/api/storage/objects/uploads/${id}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/repl/tools/bin/chromium",
  headless: true,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/api/healthz`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: 50 * 1024,
    uploadThroughput: 50 * 1024, connectionType: "cellular3g",
  });
  const samples = [];
  for (const [label, path] of [
    ["original-cold", original],
    ["preview-cold", `${original}?preview=listing-v1&width=480`],
    ["preview-warm", `${original}?preview=listing-v1&width=480`],
    ["original-warm", original],
  ]) {
    samples.push(await page.evaluate(async ({ label, path }) => {
      performance.clearResourceTimings();
      const start = performance.now();
      const image = new Image();
      image.src = path;
      await image.decode();
      document.body.replaceChildren(image);
      const timing = performance.getEntriesByName(new URL(path, location.href).href).at(-1);
      return {
        label, milliseconds: Math.round(performance.now() - start),
        // Chromium may reuse a decoded in-document image without emitting a
        // second ResourceTiming entry. That reuse transfers no network bytes.
        transferBytes: timing?.transferSize ?? 0, bodyBytes: timing?.encodedBodySize ?? 0,
        decodedMemoryReuse: !timing,
        width: image.naturalWidth, height: image.naturalHeight,
      };
    }, { label, path }));
  }
  console.log(JSON.stringify({ throttle: "50 KiB/s, 150ms latency", samples }, null, 2));
  assert.ok(samples[1].bodyBytes > 0 && samples[1].bodyBytes < samples[0].bodyBytes);
  assert.ok(samples[1].milliseconds < samples[0].milliseconds);
  assert.equal(samples[2].transferBytes, 0, "warm preview should come from browser cache");
  await context.close();
} finally {
  await browser.close();
}

import { test, expect, type Locator } from "@playwright/test";
import sharp from "sharp";

// Read-only, image-specific checks against the running shop, not CSS-only swatches.
// A white replacement is the worst-case bright crop; aborting images exercises
// both <img> fallback surfaces and CSS gradients whose URL layer failed to load.
const routes = [
  { path: "/", surfaces: [
    { surface: ".hero", copy: ".hero-copy h1, .hero-copy p" },
    { surface: ".collection-tile", copy: "h3, p, .collection-tile-cta" },
    { surface: ".moment-card", copy: ".moment-copy h3, .moment-copy p, .moment-shop-link" },
  ] },
  { path: "/about", surfaces: [
    { surface: ".about-hero", copy: ".eyebrow, h1, p" },
    { surface: ".about-cta", copy: ".eyebrow, h2, p, .button" },
  ] },
  { path: "/faq", surfaces: [
    { surface: ".faq-hero", copy: ".eyebrow, h1, p" },
  ] },
];

function luminance(rgb: number[]) {
  const linear = rgb.map(value => {
    const c = value / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

async function measure(surface: Locator, selector: string) {
  await surface.scrollIntoViewIfNeeded();
  const origin = (await surface.boundingBox())!;
  const copy = surface.locator(selector);
  const readings = await copy.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      text: element.textContent?.trim(), x: box.x, y: box.y,
      width: box.width, height: box.height,
      color: (style.color.match(/[\d.]+/g) || []).map(Number),
      size: parseFloat(style.fontSize),
    };
  }));
  // Keep layout/backgrounds intact but remove glyphs and their shadows so the
  // screenshot contains the composited photo immediately behind each text box.
  await copy.evaluateAll(elements => {
    for (const element of elements) {
      for (const node of [element, ...element.querySelectorAll("*")]) {
        const style = (node as HTMLElement).style;
        style.setProperty("-webkit-text-fill-color", "transparent");
        style.setProperty("text-shadow", "none");
        style.setProperty("border-color", "transparent");
      }
    }
  });
  const { data, info } = await sharp(await surface.screenshot({ animations: "disabled" }))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const results = readings.map(reading => {
    const x = Math.round(reading.x - origin.x), y = Math.round(reading.y - origin.y);
    expect(x, reading.text).toBeGreaterThanOrEqual(-1);
    expect(y, reading.text).toBeGreaterThanOrEqual(-1);
    expect(x + reading.width, reading.text).toBeLessThanOrEqual(info.width + 1);
    expect(y + reading.height, reading.text).toBeLessThanOrEqual(info.height + 1);
    expect(reading.size, reading.text).toBeGreaterThanOrEqual(14);
    let minimum = Infinity;
    for (let py = Math.max(0, y + 2); py < Math.min(info.height, y + reading.height - 2); py += 2) {
      for (let px = Math.max(0, x + 2); px < Math.min(info.width, x + reading.width - 2); px += 2) {
        const offset = (py * info.width + px) * info.channels;
        const background = [data[offset], data[offset + 1], data[offset + 2]];
        const alpha = reading.color[3] ?? 1;
        const foreground = reading.color.slice(0, 3).map((v, i) => v * alpha + background[i] * (1 - alpha));
        const a = luminance(foreground), b = luminance(background);
        minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05));
      }
    }
    expect(Number.isFinite(minimum), reading.text).toBe(true);
    // Require normal-copy contrast even for large headings.
    expect(minimum, `${reading.text}: ${minimum.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    return { text: reading.text, contrast: Number(minimum.toFixed(2)) };
  });
  // Remove only the test's inline properties.
  await copy.evaluateAll(elements => {
    for (const element of elements) for (const node of [element, ...element.querySelectorAll("*")]) {
      for (const property of ["-webkit-text-fill-color", "text-shadow", "border-color"]) {
        (node as HTMLElement).style.removeProperty(property);
      }
    }
  });
  return results;
}

for (const width of [1440, 390]) for (const mode of ["photos", "white", "failed"] as const) {
  test.describe(`${width}px / ${mode}`, () => {
    test.use({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    for (const route of routes) test(`promotional photo contrast ${route.path}`, async ({ page }, testInfo) => {
      if (mode !== "photos") {
        const white = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#fff" } }).png().toBuffer();
        await page.route("**/*", request => {
          if (request.request().resourceType() !== "image") return request.fallback();
          return mode === "white"
            ? request.fulfill({ contentType: "image/png", body: white })
            : request.abort("failed");
        });
      }
      await page.goto(route.path);
      await expect(page.locator(route.surfaces[0].surface).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const report = [];
      for (const item of route.surfaces) {
        const surfaces = page.locator(item.surface);
        expect(await surfaces.count(), item.surface).toBeGreaterThan(0);
        for (const surface of await surfaces.all()) {
          await surface.scrollIntoViewIfNeeded();
          if (mode === "photos") {
            for (const img of await surface.locator("img").all()) {
              await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
            }
            // CSS image requests must succeed too; a dark fallback is not proof
            // that we actually verified the merchant's photograph.
            const backgroundLoaded = await surface.evaluate(async node => {
              const url = getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
              if (!url) return true;
              const image = new Image(); image.src = url;
              try { await image.decode(); return image.naturalWidth > 0; } catch { return false; }
            });
            expect(backgroundLoaded, item.surface).toBe(true);
          }
          await surface.screenshot({ path: testInfo.outputPath(`${item.surface.slice(1)}-${report.length}.png`), animations: "disabled" });
          report.push({ surface: item.surface, readings: await measure(surface, item.copy) });
        }
      }
      await testInfo.attach("photo-contrast", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    });
  });
}

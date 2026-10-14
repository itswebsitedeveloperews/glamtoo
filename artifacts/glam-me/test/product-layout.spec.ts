import { test, expect, type Locator, type Page } from "@playwright/test";

const image = (colour: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${colour}"/></svg>`,
)}`;
const single = {
  id: 9701, slug: "layout-single-dress", name: "Layout single portrait dress",
  category: "Dresses", status: "Published", type: "Simple", price: "£25.00",
  stock: 10, image: image("pink"), galleryImages: [] as string[],
  position: "50% 50%", description: "Read-only responsive layout fixture.",
  sku: "LAYOUT-SINGLE", variations: [],
};
const multiple = {
  ...single, id: 9702, slug: "layout-multiple-dress",
  name: "Layout multiple portrait dress", sku: "LAYOUT-MULTIPLE",
  // A long rail also exercises its height cap and lower navigation control.
  galleryImages: ["blue", "green", "purple", "orange", "red", "grey", "gold"].map(image),
};

async function installFixtures(page: Page) {
  const unexpected: string[] = [];
  const responses: Record<string, unknown> = {
    "/api/catalog": {
      initialized: true, products: [single, multiple],
      categories: [{ id: 97, name: "Dresses", slug: "layout-dresses", parentId: null, image: single.image, description: "" }],
      homePage: { categoryIds: [], obsessionIds: [], momentIds: [] },
    },
    "/api/inventory": { inventory: {} },
    "/api/stripe/product-sales": { sales: {} },
    "/api/shipping-methods": { shippingMethods: [] },
    "/api/return-information": { content: "" },
    "/api/size-guide": { sizeGuide: [] },
    "/api/seo/resolve": { status: 200, title: "Product layout fixture" },
  };
  // Use the same signed-out SDK shape as the existing public SSR tests.
  await page.addInitScript(() => {
    const resources = { client: { sessions: [] }, session: null, user: null, organization: null };
    Object.assign(window, { Clerk: {
      loaded: true, load: async () => {}, ...resources,
      __internal_lastEmittedResources: resources,
      addListener: (listener: (value: typeof resources) => void) => {
        listener(resources);
        return () => {};
      },
    } });
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (request.resourceType() === "document") {
      // Isolated client catalog owns the page, not the harness's SSR snapshot.
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /<div id="root">[\s\S]*?<\/div><script id="public-storefront-data" type="application\/json">[\s\S]*?<\/script>/,
        '<div id="root"></div>',
      );
      return route.fulfill({ response, body });
    }
    if (url.pathname in responses) return route.fulfill({ json: responses[url.pathname] });
    if (url.pathname.startsWith("/api/") || !/^(127\.0\.0\.1|localhost)$/.test(url.hostname)) {
      unexpected.push(`${request.method()} ${url.href}`);
      return route.abort();
    }
    return route.continue();
  });
  return unexpected;
}

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}
const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
const near = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(2);
function noOverlap(a: Box, b: Box, label: string) {
  expect(right(a) <= b.x + 1 || right(b) <= a.x + 1
    || bottom(a) <= b.y + 1 || bottom(b) <= a.y + 1, label).toBe(true);
}

async function loadedImage(locator: Locator, alt: string) {
  await expect(locator).toHaveAttribute("alt", alt);
  await expect.poll(() => locator.evaluate((img: HTMLImageElement) =>
    img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
  ), { message: `Image must decode: ${alt}` }).toBe(true);
}

async function assertLayout(page: Page, product: typeof single, width: number, selected: number) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => document.fonts.ready);
  const layout = await box(page.locator(".product-detail-layout"));
  const gallery = await box(page.locator(".product-gallery"));
  const viewer = await box(page.locator(".gallery-viewer"));
  const frame = await box(page.locator(".gallery-image"));
  const category = await box(page.locator(".detail-intro .eyebrow"));
  const heading = page.getByRole("heading", { level: 1, name: product.name, exact: true });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const title = await box(heading);
  await expect(page.locator(".detail-intro .eyebrow")).toHaveText("Dresses");
  const form = await box(page.locator(".detail-form"));
  const mainImage = page.locator(".gallery-image img");
  await loadedImage(mainImage, `${product.name} view ${selected}`);
  await expect(mainImage).toHaveAttribute("src", [product.image, ...product.galleryImages][selected - 1]);
  const photo = await box(mainImage);
  near(photo.width, frame.width, "photo fills frame width");
  near(photo.height, frame.height, "photo fills frame height");
  expect(await mainImage.evaluate(el => getComputedStyle(el).objectFit)).toBe("cover");
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
  }));
  expect(viewport.scroll, "no horizontal page overflow").toBeLessThanOrEqual(viewport.width + 1);

  if (width <= 1024) {
    expect(bottom(category), "category precedes title").toBeLessThanOrEqual(title.y + 1);
    expect(bottom(title), "title precedes gallery").toBeLessThanOrEqual(gallery.y + 1);
    expect(bottom(viewer), "purchase form follows viewer").toBeLessThanOrEqual(form.y + 1);
    if (width >= 768) {
      near(frame.width, Math.min(layout.width * 0.6, 480), "smaller tablet frame");
      near(gallery.x, layout.x, "tablet gallery left aligned in content");
      // The rail now participates in layout, rather than hanging outside a
      // centered gallery. Leave its 85px width + 20px gap before the viewer.
      near(frame.x, layout.x + (product.galleryImages.length && width > 800 ? 105 : 0),
        "tablet viewer follows rail at left edge");
      near(frame.height, frame.width * 4 / 3, "tablet 3:4 portrait frame");
    } else {
      near(frame.width, layout.width, "phone photo remains full content width");
      near(frame.width, width - 34, "phone retains original container gutters");
      near(frame.height, frame.width / 0.85, "phone retains original aspect ratio");
    }
  } else {
    const copy = await box(page.locator(".detail-copy"));
    expect(right(gallery), "desktop gallery left of purchase column").toBeLessThanOrEqual(copy.x);
    near(gallery.y, copy.y, "desktop columns remain top aligned");
    expect(title.y, "desktop title stays beside gallery").toBeLessThan(bottom(frame));
    expect(frame.width, "desktop photo not restricted by tablet 60% rule").toBeGreaterThan(gallery.width * 0.7);
    near(frame.height, frame.width / 0.85, "desktop retains original aspect ratio");
    noOverlap(viewer, form, "desktop viewer and purchase form");
  }
  const rail = page.locator(".gallery-thumbnails-col");
  if (product.galleryImages.length === 0) {
    await expect(rail).toHaveCount(0);
  } else {
    await expect(page.locator(".gallery-thumbnail")).toHaveCount(product.galleryImages.length + 1);
    if (width <= 800) {
      await expect(rail).toBeHidden();
    } else {
      const thumbnails = await box(rail);
      noOverlap(thumbnails, viewer, "thumbnail rail must not overlap viewer");
      noOverlap(thumbnails, form, "thumbnail rail must not overlap purchase form");
      expect(right(thumbnails), "thumbnails stay left of viewer").toBeLessThanOrEqual(viewer.x);
      expect(thumbnails.x, "thumbnails remain within content").toBeGreaterThanOrEqual(layout.x - 1);
      if (width <= 1024) {
        expect(bottom(thumbnails), "entire rail clears purchase form").toBeLessThanOrEqual(form.y + 1);
      }
      const first = page.locator(".gallery-thumbnail img").first();
      await first.scrollIntoViewIfNeeded();
      await loadedImage(first, `${product.name} gallery view 1`);
    }
  }
}

for (const product of [single, multiple]) {
  test(`${product.galleryImages.length ? "multi-image" : "single-image"} product retains approved geometry after resizing`, async ({ page }) => {
    const unexpected = await installFixtures(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/product/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    // Same mounted product throughout: exercise both sides of every breakpoint,
    // then return to desktop to catch stale gallery dimensions/state.
    for (const width of [1280, 1024, 820, 768, 393, 820, 1280]) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await assertLayout(page, product, width, 1);
        if (product.galleryImages.length) {
          if (width > 800) {
            await page.locator(".gallery-thumbnail").nth(1).click();
          } else {
            await page.locator(".gallery-viewer").getByRole("button", { name: "View next product image" }).click();
          }
          await assertLayout(page, product, width, 2);
          await page.locator(".gallery-viewer").getByRole("button", { name: "View previous product image" }).click();
          await loadedImage(page.locator(".gallery-image img"), `${product.name} view 1`);
        }
      });
    }
    expect(unexpected, "no writes or unexpected API/external calls").toEqual([]);
  });
}

test("geometry checks reject representative layout regressions", async ({ page }) => {
  const unexpected = await installFixtures(page);
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto(`/product/${multiple.slug}`);
  await assertLayout(page, multiple, 820, 1);
  // Browser-only negative controls: demonstrate the checks catch bad CSS,
  // without editing the approved stylesheet or any catalog data.
  const regressions = [
    { width: 820, css: ".detail-intro { order: 4 !important; }", error: "title precedes gallery" },
    { width: 820, css: ".product-gallery .gallery-viewer { width: 100% !important; max-width: none !important; }", error: "smaller tablet frame" },
    { width: 820, css: ".gallery-image { aspect-ratio: 1 !important; }", error: "tablet 3:4 portrait frame" },
    { width: 820, css: ".gallery-thumbnails-col { transform: translateX(120px) !important; }", error: "thumbnail rail must not overlap viewer" },
    { width: 393, css: ".product-gallery { width: 60% !important; }", error: "phone photo remains full content width" },
    { width: 1280, css: ".product-detail-layout { display: flex !important; flex-direction: column !important; }", error: "desktop gallery left of purchase column" },
  ];
  for (const regression of regressions) {
    await test.step(regression.error, async () => {
      await page.setViewportSize({ width: regression.width, height: 1000 });
      const style = await page.addStyleTag({ content: regression.css });
      try {
        await expect(assertLayout(page, multiple, regression.width, 1)).rejects.toThrow(regression.error);
      } finally {
        await style.evaluate(element => element.parentNode!.removeChild(element));
      }
    });
  }
  expect(unexpected).toEqual([]);
});

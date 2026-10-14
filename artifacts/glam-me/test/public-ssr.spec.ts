import { test, expect, type Page } from "@playwright/test";

const routes = [
  { path: "/", heading: "It's your moment", image: ".hero-image" },
  { path: "/shop", heading: "Pieces with presence.", image: ".product-card img" },
  { path: "/category", heading: "Find your moment.", image: ".category-directory-card img" },
  { path: "/category/stable-dresses", heading: "Dresses", image: ".product-card img" },
  { path: "/product/variable-evening", heading: "Variable evening dress", image: ".gallery-viewer img" },
];

async function documentChecks(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, follow");
  // Never strip or replace the document/snapshot in this suite.
  await expect(page.locator("#public-storefront-data")).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.locator("main")).not.toContainText(/Loading the collection|temporarily unavailable/);
}

async function visibleLayout(page: Page, route: typeof routes[number]) {
  await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  // Check actual rendered CSS, not just a successful stylesheet response.
  const layout = await page.evaluate(() => ({
    headingSize: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize),
    headerPosition: getComputedStyle(document.querySelector(".site-header")!).position,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sheets: [...document.styleSheets].filter(sheet => sheet.href).length,
  }));
  expect(layout.sheets).toBeGreaterThan(0);
  expect(layout.headingSize).toBeGreaterThan(24);
  expect(layout.headerPosition).toBe("sticky");
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  const image = page.locator(route.image).first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth > 0 && !element.currentSrc.startsWith("file:"),
  )).toBe(true);
  const box = await image.boundingBox();
  expect(box!.width).toBeGreaterThan(80);
  expect(box!.height).toBeGreaterThan(80);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`without JavaScript at ${viewport.width}px`, () => {
    test.use({ javaScriptEnabled: false, viewport });
    for (const route of routes) {
      test(`styled SSR layout and images: ${route.path}`, async ({ page }) => {
        const assetFailures: string[] = [];
        const styles: string[] = [];
        page.on("response", response => {
          const kind = response.request().resourceType();
          if (["stylesheet", "image"].includes(kind) && response.status() >= 400) {
            assetFailures.push(`${response.status()} ${response.url()}`);
          }
          if (kind === "stylesheet" && response.ok()) styles.push(response.url());
        });
        page.on("requestfailed", request => {
          if (["stylesheet", "image"].includes(request.resourceType())) assetFailures.push(request.url());
        });
        await documentChecks(page, route.path);
        await visibleLayout(page, route);
        expect(styles.length).toBeGreaterThan(0);
        expect(assetFailures).toEqual([]);
      });
    }

    test("ordinary public links work without client routing", async ({ page }) => {
      await documentChecks(page, "/");
      await page.getByTestId("link-hero-shop").click();
      await expect(page).toHaveURL(/\/shop$/);
      await expect(page.locator("#public-storefront-data")).toHaveCount(1);
      await page.getByTestId("link-product-9002").first().click();
      await expect(page).toHaveURL(/\/product\/variable-evening$/);
      await expect(page.locator(".detail-price")).toHaveText("£39.75");
      await page.locator('main a[href="/category/stable-dresses"]').filter({ visible: true }).first().click();
      await expect(page).toHaveURL(/\/category\/stable-dresses$/);
      await expect(page.getByRole("heading", { name: "Dresses", exact: true })).toBeVisible();
    });
  });
}

test.describe("hydrated public pages", () => {
  test.use({ javaScriptEnabled: true, viewport: { width: 1440, height: 1000 } });

  for (const route of routes) {
    test(`snapshot hydrates and reaches the bag: ${route.path}`, async ({ page }) => {
      const errors: string[] = [];
      const writes: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" || /hydration|did not match|server rendered|Minified React error #(418|423|425)/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.route("**/*", route => {
        const request = route.request();
        if (!["GET", "HEAD"].includes(request.method())) {
          writes.push(`${request.method()} ${request.url()}`);
          return route.abort();
        }
        // No external services are needed or permitted for this public suite.
        if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) return route.abort();
        return route.continue();
      });
      // Post-hydration count must reflect disposable browser storage, not SSR.
      await page.addInitScript(() => {
        if (localStorage.getItem("glam-me-cart-v1") === null) {
          localStorage.setItem("glam-me-cart-v1",
            '[{"productId":9002,"variationId":21,"size":"M","quantity":1}]');
        }
      });
      // Keep the real React provider and app tree, but supply only the SDK's
      // signed-out resources. Authentication itself is a separate test suite.
      await page.addInitScript(() => {
        const resources = { client: { sessions: [] }, session: null, user: null, organization: null };
        Object.assign(window, { Clerk: {
          loaded: true,
          load: async () => {},
          ...resources,
          __internal_lastEmittedResources: resources,
          addListener: (listener: (value: typeof resources) => void) => {
            listener(resources);
            return () => {};
          },
        } });
      });
      await documentChecks(page, route.path);
      await visibleLayout(page, route);
      // A working state-changing control proves hydration completed; merely
      // finding server-rendered text would pass even if JS never executed.
      await expect(page.getByTestId("link-cart")).toHaveAttribute("aria-label", "Shopping bag, 1 item");
      if (route.path.startsWith("/product/")) {
        await page.getByRole("combobox", { name: "Select size" }).selectOption("M");
        await expect(page.getByTestId("button-add-to-bag-9002")).toBeEnabled();
        await page.getByTestId("button-add-to-bag-9002").click();
        await expect(page.getByTestId("link-cart")).toHaveAttribute("aria-label", "Shopping bag, 2 items");
      }
      await page.getByTestId("link-cart").click();
      await expect(page).toHaveURL(/\/cart$/);
      await expect(page.getByRole("heading", { name: "Your bag.", exact: true })).toBeVisible();
      await expect(page.locator(".cart-item-price")).toHaveText(route.path.startsWith("/product/") ? "£79.50" : "£39.75");
      await expect(page.locator("#public-storefront-data")).toHaveCount(0);
      expect(errors, "browser errors / hydration diagnostics").toEqual([]);
      expect(writes, "public checks must not write to services").toEqual([]);
    });
  }

  test("discovery stays disabled", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toMatch(/<url>|<loc>/);
  });
});

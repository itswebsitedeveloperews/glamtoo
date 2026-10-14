import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { expectControlContrast } from "./helpers/contrast";

const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect width='400' height='500' fill='pink'/%3E%3C/svg%3E";
const product = {
  id: 1791952756162, slug: "qa-new-api-only", name: "New API-only product",
  category: "Handbags", price: "£1.00", stock: 2, status: "Published", type: "Simple",
  description: "Regression fixture.", image, position: "50% 50%", sku: "isolated", variations: [],
};
const military = {
  ...product, id: 108, slug: "military-style-jacket", name: "Military Style Jacket",
  description: "White Military Style Jacket", type: "Variable", price: "£35.99",
  variationAttributes: ["size"], galleryImages: [image.replace("pink", "blue")],
  variations: [{ id: 1081, size: "S/M", colour: "", price: "£35.99", stock: 2, sku: "test-sm" }],
};
const payload = {
  initialized: true, products: [product, military],
  categories: [{ id: 3, name: "Handbags", slug: "handbags", image, description: "" }],
  homePage: { categoryIds: [3], obsessionIds: [product.id], momentIds: [108] },
};

async function fixtures(page: Page) {
  await page.route("**/api/catalog", (route) => route.fulfill({ json: payload }));
  await page.route("**/api/inventory", (route) => route.fulfill({ json: { inventory: { [product.id]: 2, "108:1081": 2 } } }));
  await page.route("**/api/shipping-methods", (route) => route.fulfill({ json: { shippingMethods: [{ id: "test", name: "Standard", description: "Configured delivery", price: 399, freeOver: 7500, enabled: true, sortOrder: 0 }] } }));
  await page.route("**/api/return-information", (route) => route.fulfill({ json: { content: "<p>Owner-approved returns.</p>" } }));
  await page.route("**/api/size-guide", (route) => route.fulfill({ json: { sizeGuide: [] } }));
  await page.route("**/api/stripe/product-sales", (route) => route.fulfill({ json: { sales: {} } }));
  // No provider requests or payment intents: this covers our UI, not Stripe's private DOM.
  await page.route("**/api/stripe/payment-config", (route) => route.fulfill({ status: 503, json: { error: "Isolated test: payments disabled" } }));
}

// Serve real production output on the existing preview origin without starting
// another service or contacting production. API fixtures remain isolated.
test.beforeEach(async ({ page }) => {
  if (!process.env.STOREFRONT_PRODUCTION_BUILD) return;
  const root = resolve(import.meta.dirname, "../dist/public");
  await page.route("http://localhost/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/")) return route.fallback();
    const file = path.startsWith("/assets/") ? resolve(root, `.${path}`) : resolve(root, "index.html");
    if (!file.startsWith(`${root}/`)) return route.abort();
    const contentType = ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg" } as Record<string, string>)[extname(file)] || "application/octet-stream";
    await route.fulfill({ body: await readFile(file), contentType });
  });
});

test("API-only simple product survives guest add, basket navigation, direct checkout and reload", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => {
    window.Stripe = (() => ({
      elements: () => ({ create: () => ({
        mount: (target: HTMLElement) => { const input = document.createElement("input"); input.setAttribute("aria-label", "Isolated card field"); target.appendChild(input); },
        destroy() {}, on() {},
      }) }),
    })) as typeof window.Stripe;
  });
  await page.route("**/api/stripe/payment-config", (route) => route.fulfill({ json: { publishableKey: "pk_test_isolated_not_a_real_key" } }));
  await page.goto(`/product/${product.slug}`);
  await page.getByTestId(`button-add-to-bag-${product.id}`).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator(".cart-item-price")).toHaveText("£1.00");
  await page.getByRole("link", { name: /Go to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator(".checkout-order-item")).toContainText(product.name);
  await expect(page.getByLabel("First name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Isolated card field")).toBeVisible();
  await expect(page.getByTestId("button-place-order")).toBeEnabled();
  // A stalled local-media database must not block authoritative checkout lines.
  await page.addInitScript(() => { indexedDB.open = (() => ({})) as typeof indexedDB.open; });
  await page.route("**/api/catalog", async (route) => {
    await new Promise((r) => setTimeout(r, 650));
    await route.fulfill({ json: { ...payload, products: [{ ...product, image: "glam-too-media:test:delayed" }] } });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Loading the collection…" })).toBeVisible();
  await expect(page.locator(".checkout-order-item")).toContainText(product.name);
  await expect(page).toHaveURL(/\/checkout$/);
  await page.goto("/checkout");
  await expect(page.getByLabel("First name", { exact: true })).toBeVisible();
  await expect(page.getByTestId("button-place-order")).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("glam-me-cart-v1")!)[0].productId)).toBe(product.id);
});

test("a truly empty guest checkout returns to the empty bag", async ({ page }) => {
  await fixtures(page);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("main.page")).toContainText("Your bag is empty");
  await expect(page.getByRole("heading", { name: "Some bag items are unavailable" })).toHaveCount(0);
});

test("API-only checkout retains identifiers through errors and background catalog refresh", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript((id) => localStorage.setItem("glam-me-cart-v1", JSON.stringify([{ productId: id, size: "", quantity: 1 }])), product.id);
  await page.route("**/api/catalog", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Unable to load the collection" })).toBeVisible();
  await page.route("**/api/catalog", (route) => route.fulfill({ json: payload }));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".checkout-order-item")).toContainText(product.name);
  await page.getByLabel("First name", { exact: true }).fill("Retained");
  await page.evaluate(() => window.dispatchEvent(new Event("glam-catalog-updated")));
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Retained");
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...payload, products: [] } }));
  await page.evaluate(() => window.dispatchEvent(new Event("glam-catalog-updated")));
  await expect(page.getByRole("heading", { name: "Some bag items are unavailable" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("glam-me-cart-v1")!)[0].productId)).toBe(product.id);
});

for (const path of ["/", "/shop", "/product/military-style-jacket", "/account", "/cart", "/checkout"]) {
  test(`WCAG AA contrast ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fixtures(page);
    await page.addInitScript((id) => localStorage.setItem("glam-me-cart-v1", JSON.stringify([{ productId: id, size: "", quantity: 1 }])), product.id);
    await page.goto(path);
    if (path === "/account") await expect(page.locator(".cl-card")).toBeVisible();
    else await expect(page.locator("main.page")).toContainText(path === "/checkout" ? "Billing" : path === "/cart" ? product.name : path.startsWith("/product") ? military.name : product.name);
    await page.evaluate(() => document.fonts.ready);
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    await testInfo.attach("axe", { body: JSON.stringify(scan, null, 2), contentType: "application/json" });
    expect(scan.violations.filter((v) => v.id === "color-contrast")).toEqual([]);
    // Exercise applicable hover/focus states, with no blanket axe suppression.
    const controls = page.locator(".nav a:last-child, .button:not(:disabled), .product-info-link:has(.product-shop-now), .checkout-coupon-form button:not(:disabled), .cl-formButtonPrimary, .cl-socialButtonsBlockButton");
    for (const control of await controls.all()) {
      if (!await control.isVisible()) continue;
      await expectControlContrast(page, control);
      await control.hover();
      await control.focus();
      const states = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(states.violations).toEqual([]);
    }
  });
}

test("shared action button classes keep normal-size AA across default, hover and keyboard focus", async ({ page }) => {
  await fixtures(page);
  await page.goto("/order-confirmation");
  await expect(page.locator(".ocv")).toBeVisible();
  // Use the shipped stylesheet, including shared admin selectors, without
  // signing in or sending any administrative mutations.
  const classes = [
    "button", "customer-recovery-button", "account-order-view-button",
    "admin-primary", "admin-secondary", "admin-quiet-button", "admin-upload-button",
    "admin-order-details-button", "admin-overview-payment-button", "admin-danger-button",
    "shop-filter-apply",
  ];
  await page.evaluate((classes) => {
    const section = document.createElement("section");
    section.id = "shared-button-contrast-fixture";
    for (const className of classes) {
      const button = document.createElement("button");
      button.className = className;
      button.textContent = `Fixture ${className}`;
      section.appendChild(button);
    }
    for (const className of ["contact-form", "newsletter-form", "footer-newsletter-form", "account-shortcuts", "checkout-coupon-form"]) {
      const wrapper = document.createElement("div");
      wrapper.className = className;
      const button = document.createElement("button");
      button.className = "button";
      button.textContent = `Fixture ${className}`;
      wrapper.appendChild(button);
      section.appendChild(wrapper);
    }
    document.body.appendChild(section);
  }, classes);
  const controls = page.locator("#shared-button-contrast-fixture button");
  await expect(controls).toHaveCount(16);
  for (const control of await controls.all()) await expectControlContrast(page, control);
});

for (let run = 1; run <= 3; run++) {
  test(`mobile product maximum-session CLS sample ${run}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixtures(page);
    await page.addInitScript(() => {
      const state = { entries: [] as Array<{ startTime: number; value: number; sources: unknown[] }> };
      (window as unknown as { cls: typeof state }).cls = state;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput: boolean; value: number; sources: Array<{ node?: Element; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
          if (entry.hadRecentInput) continue;
          state.entries.push({ startTime: entry.startTime, value: entry.value, sources: entry.sources.map((source) => ({
            node: source.node?.tagName, class: source.node?.getAttribute("class"),
            previousRect: source.previousRect, currentRect: source.currentRect,
          })) });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.route("**/api/catalog", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({ json: { ...payload, products: [product, { ...military, image: "/api/storage/objects/isolated-cls-image" }] } });
    });
    await page.route("**/api/storage/objects/isolated-cls-image", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='400' height='500' fill='pink'/></svg>" });
    });
    await page.route("**/api/size-guide", async (route) => {
      await new Promise((r) => setTimeout(r, 1300));
      await route.fulfill({ json: { sizeGuide: [{ id: "test", size: "S/M", ukSize: "8", bust: "80", waist: "60", hips: "90" }] } });
    });
    await page.goto("/product/military-style-jacket");
    await expect(page.getByTestId("button-add-to-bag-108")).toBeVisible();
    const reservedGallery = await page.locator(".gallery-image").boundingBox();
    expect(reservedGallery?.width).toBeGreaterThan(350);
    expect(reservedGallery?.height).toBeGreaterThan(400);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2600);
    const measurements = await page.evaluate(() => {
      const { entries } = (window as unknown as { cls: { entries: Array<{ startTime: number; value: number; sources: unknown[] }> } }).cls;
      let max = 0, sum = 0, first = 0, last = 0;
      for (const entry of entries) {
        if (!sum || entry.startTime - last >= 1000 || entry.startTime - first >= 5000) { first = entry.startTime; sum = 0; }
        sum += entry.value; last = entry.startTime; max = Math.max(max, sum);
      }
      return { maxSessionCLS: max, entries, viewport: { width: innerWidth, height: innerHeight } };
    });
    await testInfo.attach("cls-sources", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
    console.log(`CLS ${run}: ${JSON.stringify(measurements)}`);
    const loadedGallery = await page.locator(".gallery-image").boundingBox();
    expect(loadedGallery?.width).toBe(reservedGallery?.width);
    expect(loadedGallery?.height).toBe(reservedGallery?.height);
    if (!process.env.CLS_DIAGNOSTIC) expect(measurements.maxSessionCLS).toBeLessThanOrEqual(0.1);
  });
}

test("actual Stripe keyboard and axe diagnostic without payment submission", async ({ page }, testInfo) => {
  test.skip(!process.env.STRIPE_ACCESSIBILITY_DIAGNOSTIC, "Opt-in real SDK check; never submits a payment.");
  await fixtures(page);
  const response = await page.request.get("/api/stripe/payment-config");
  expect(response.ok(), "Actual supported payment configuration is required").toBeTruthy();
  const config = await response.json();
  expect(Boolean(config.publishableKey)).toBeTruthy();
  await page.route("**/api/stripe/payment-config", (route) => route.fulfill({ json: config }));
  await page.route("**/api/stripe/*", (route) => route.request().method() === "GET" ? route.fallback() : route.abort());
  await page.addInitScript((id) => localStorage.setItem("glam-me-cart-v1", JSON.stringify([{ productId: id, size: "", quantity: 1 }])), product.id);
  await page.goto("/checkout");
  const frame = page.frameLocator('iframe[title="Secure card payment input frame"]');
  const number = frame.locator('input[name="cardnumber"]');
  await expect(number).toBeVisible({ timeout: 20000 });
  // Focus enters through the real keyboard, not a private Stripe DOM mutation.
  await page.getByLabel("First name", { exact: true }).focus();
  let entered = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if (await number.evaluate((input) => document.activeElement === input)) { entered = true; break; }
  }
  expect(entered, "Tab reaches Stripe's card number field").toBeTruthy();
  await page.keyboard.press("Tab");
  const expiryFocused = await frame.locator('input[name="exp-date"]').evaluate((input) => document.activeElement === input);
  expect(expiryFocused).toBeTruthy();
  await page.keyboard.press("Tab");
  expect(await frame.locator('input[name="cvc"]').evaluate((input) => document.activeElement === input)).toBeTruthy();
  await page.keyboard.press("Tab");
  expect(await page.locator("iframe").evaluateAll((frames) => !frames.includes(document.activeElement as HTMLIFrameElement))).toBeTruthy();
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  await testInfo.attach("real-stripe-axe", { body: JSON.stringify(scan, null, 2), contentType: "application/json" });
  console.log(`Actual Stripe axe findings: ${JSON.stringify(scan.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })))}`);
});

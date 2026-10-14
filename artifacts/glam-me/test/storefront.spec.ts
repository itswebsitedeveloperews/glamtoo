import { test, expect, type Page } from "@playwright/test";

const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='pink'/%3E%3C/svg%3E";
const simple = {
  id: 108, slug: "military-style-jacket", name: "Military Style Jacket", category: "Dresses",
  price: "£17.25", stock: 5, status: "Published", type: "Simple", description: "",
  image, position: "50% 50%", sku: "test", variations: [], galleryImages: [image.replace("pink", "blue")],
};
const variable = {
  ...simple, id: 900, slug: "defined-options", name: "Defined options", type: "Variable",
  price: "£1.00", variationAttributes: ["size"],
  variations: [
    { id: 9001, size: "S", colour: "", stock: 3, price: "£24.50", sku: "test-s" },
    { id: 9002, size: "M", colour: "", stock: 3, price: "£26.50", sku: "test-m" },
  ],
};
const catalog = {
  initialized: true, products: [simple, variable],
  categories: [
    { id: 1, name: "Clothes", slug: "clothes", parentId: null, image, description: "" },
    { id: 2, name: "Dresses", slug: "dresses", parentId: 1, image, description: "" },
    { id: 3, name: "New In", slug: "new-in", parentId: null, image, description: "" },
    { id: 4, name: "Purses", slug: "purses", parentId: null, image, description: "" },
  ],
  homePage: { categoryIds: [1, 3, 4], obsessionIds: [108], momentIds: [] },
};
const shipping = { shippingMethods: [{ id: "8", name: "Owner delivery", description: "Owner delivery description", price: 825, freeOver: 12300, enabled: true, sortOrder: 0 }] };

test.describe("product image lightbox keyboard", () => {
  for (const width of [390, 820, 1440]) {
    test(`focus, arrows, dismissal and restoration at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await fixtures(page);
      await page.goto("/product/military-style-jacket");
      const trigger = page.getByRole("button", { name: "Open larger product image" });
      // Reproduce pointer opening, not just keyboard activation.
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Military Style Jacket enlarged image", exact: true });
      const close = dialog.getByRole("button", { name: "Close enlarged image" });
      const previous = dialog.getByRole("button", { name: "View previous product image" });
      const next = dialog.getByRole("button", { name: "View next product image" });
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(next).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(previous).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      // An outside programmatic focus attempt must not escape the modal.
      await trigger.evaluate((button) => button.focus());
      await expect(close).toBeFocused();

      const enlargedImage = dialog.getByRole("img");
      const firstSource = await enlargedImage.getAttribute("src");
      await page.keyboard.press("ArrowRight");
      await expect(enlargedImage).toHaveAttribute("alt", "Military Style Jacket enlarged view 2");
      expect(await enlargedImage.getAttribute("src")).not.toBe(firstSource);
      await expect(close).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(enlargedImage).toHaveAttribute("src", firstSource!);
      await page.keyboard.press("ArrowLeft");
      await expect(enlargedImage).toHaveAttribute("alt", "Military Style Jacket enlarged view 2");
      await page.keyboard.press("Tab");
      await expect(previous).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

      await page.keyboard.press("Enter");
      await expect(close).toBeFocused();
      // Keyboard activation is independent of development-banner pointer overlap.
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test("single image traps both Tab directions and restores focus after pointer dismissal", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await fixtures(page, { ...catalog, products: [{ ...simple, galleryImages: [] }] });
    await page.goto("/product/military-style-jacket");
    const trigger = page.getByRole("button", { name: "Open larger product image" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Military Style Jacket enlarged image" });
    const close = dialog.getByRole("button", { name: "Close enlarged image" });
    await expect(close).toBeFocused();
    await expect(dialog.getByRole("button")).toHaveCount(1);
    for (const key of ["Tab", "Shift+Tab", "ArrowLeft", "ArrowRight"]) {
      await page.keyboard.press(key);
      await expect(close).toBeFocused();
      await expect(dialog.getByRole("img")).toHaveAttribute("alt", "Military Style Jacket enlarged view 1");
    }
    // Test the app control without force-clicking through a development overlay.
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog.getByRole("img").click();
    await expect(dialog).toBeVisible();
    await dialog.click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

async function fixtures(page: Page, payload = catalog) {
  // These tests deliberately exercise browser-only catalog loading/failure.
  // Browser API mocks cannot control a document's server-side snapshot.
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const html = await response.text();
    const body = html.replace(
      /<div id="root">[\s\S]*?<\/div><script id="public-storefront-data" type="application\/json">[\s\S]*?<\/script>/,
      '<div id="root"></div>',
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/api/catalog", (route) => route.fulfill({ json: payload }));
  await page.route("**/api/inventory", (route) => route.fulfill({ json: { inventory: {} } }));
  await page.route("**/api/shipping-methods", (route) => route.fulfill({ json: shipping }));
  await page.route("**/api/return-information", (route) => route.fulfill({ json: { content: "<p>Owner-approved return content.</p>" } }));
  await page.route("**/api/size-guide", (route) => route.fulfill({ json: { sizeGuide: [] } }));
  await page.route("**/api/stripe/product-sales", (route) => route.fulfill({ json: { sales: {} } }));
  await page.route("**/api/stripe/payment-config", (route) => route.fulfill({ status: 503, json: { error: "Payments not enabled in this test" } }));
}

for (const path of ["/", "/product/military-style-jacket", "/cart", "/checkout"]) {
  test(`delayed catalog never exposes bundled or local quotes on ${path}`, async ({ page }) => {
    await fixtures(page);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/catalog", async (route) => { await delayed; await route.fulfill({ json: catalog }); });
    await page.addInitScript(() => {
      localStorage.setItem("glam-me-admin-products-v4", JSON.stringify([{ id: 108, status: "Published", name: "Local demo", price: "£0.01" }]));
      localStorage.setItem("glam-me-cart-v1", JSON.stringify([{ productId: 108, size: "", quantity: 1 }]));
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Loading the collection…" })).toBeVisible();
    await expect(page.locator("main.page")).not.toContainText(/£|Luna|Local demo/);
    release();
    await expect(page.locator("main.page")).toContainText("£17.25");
    await expect(page.locator("main.page")).not.toContainText("£35.99");
  });
}

test("failed catalog can retry without losing bag identifiers", async ({ page }) => {
  await fixtures(page);
  let fail = true;
  await page.route("**/api/catalog", (route) => route.fulfill(fail ? { status: 503, json: { error: "Unavailable" } } : { json: catalog }));
  await page.addInitScript(() => localStorage.setItem("glam-me-cart-v1", '[{"productId":108,"size":"","quantity":2}]'));
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Unable to load the collection" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("glam-me-cart-v1")!)[0].quantity)).toBe(2);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".cart-item-price")).toHaveText("£34.50");
});

test("initialized empty and uninitialized catalogs never restore demos", async ({ page }) => {
  await fixtures(page, { ...catalog, products: [] });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No products are available right now." })).toBeVisible();
  await expect(page.locator(".product-card, .collection-tile")).toHaveCount(0);
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...catalog, initialized: false, products: [] } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Collection unavailable", exact: true })).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
});

test("empty category promotions are omitted but stable URLs stay accessible", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await expect(page.locator(".collection-tile")).toHaveCount(1);
  await expect(page.locator(".nav a[href='/category/clothes']")).toHaveCount(1);
  await expect(page.locator(".nav a[href='/category/new-in'], .footer a[href='/category/purses']")).toHaveCount(0);
  await expect(page.locator(".footer form")).toHaveCount(0);
  await expect(page.locator(".footer")).not.toContainText(/Sale|Style Journal|Sign up/);
  await expect(page.getByTestId("link-footer-delivery")).toHaveAttribute("href", "/delivery-returns");
  await page.goto("/category/purses");
  await expect(page.getByRole("heading", { name: "Purses", exact: true })).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
});

test("saved empty home selections and active product state survive refresh", async ({ page }) => {
  await fixtures(page, { ...catalog, homePage: { categoryIds: [], obsessionIds: [], momentIds: [] } });
  await page.goto("/");
  await expect(page.locator(".collection-tile, .product-card, .moment-card")).toHaveCount(0);
  await page.goto("/product/military-style-jacket");
  await expect(page.getByTestId("button-add-to-bag-108")).toBeEnabled();
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...catalog, products: [{ ...simple, price: "£17.75" }, variable] } }));
  await page.evaluate(() => window.dispatchEvent(new Event("glam-catalog-updated")));
  await expect(page.locator(".detail-price")).toHaveText("£17.75");
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveText("2");
  await expect(page.locator(".detail-copy")).not.toContainText("One size");
  await expect(page.locator(".variation-options")).toHaveCount(0);
});

test("failed background refresh retains resolved prices and gallery state through retry", async ({ page }) => {
  await fixtures(page);
  await page.goto("/product/military-style-jacket");
  await expect(page.locator(".detail-price")).toHaveText("£17.25");
  await page.locator(".gallery-viewer").getByRole("button", { name: "View next product image" }).click();
  await page.route("**/api/catalog", (route) => route.fulfill({ status: 503, json: {} }));
  await page.evaluate(() => window.dispatchEvent(new Event("glam-catalog-updated")));
  await expect(page.locator(".catalog-refresh-notice")).toBeVisible();
  await expect(page.locator(".detail-price")).toHaveText("£17.25");
  await expect(page.locator(".gallery-pagination-status")).toHaveText("2 / 2");
  await page.route("**/api/catalog", (route) => route.fulfill({ json: catalog }));
  await page.locator(".catalog-refresh-notice").getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".catalog-refresh-notice")).toHaveCount(0);
  await expect(page.locator(".gallery-pagination-status")).toHaveText("2 / 2");
});

test("four original-order gallery views synchronize thumbnails, arrows, keyboard, touch and zoom", async ({ page }) => {
  const photos = [image, ...["blue", "green", "orange"].map((colour) => image.replace("pink", colour))];
  await fixtures(page, { ...catalog, products: [{ ...simple, galleryImages: photos.slice(1) }, { ...variable, galleryImages: [] }] });
  await page.goto("/product/military-style-jacket");
  const viewer = page.locator(".gallery-viewer");
  const status = page.locator(".gallery-pagination-status");
  const thumbs = page.locator(".gallery-thumbnail");
  await expect(thumbs).toHaveCount(4);
  await expect(status).toHaveText("1 / 4");
  for (let index = 0; index < 4; index++) {
    await thumbs.nth(index).click();
    await expect(viewer.locator(".gallery-image img")).toHaveAttribute("src", photos[index]);
    await expect(thumbs.nth(index)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".gallery-thumbnail.is-active")).toHaveCount(1);
    await expect(status).toHaveText(`${index + 1} / 4`);
  }
  await viewer.getByRole("button", { name: "View next product image" }).click();
  await expect(status).toHaveText("1 / 4");
  await viewer.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(status).toHaveText("4 / 4");
  await page.keyboard.press("ArrowRight");
  await expect(status).toHaveText("1 / 4");
  await viewer.evaluate((element) => {
    const touch = (clientX: number) => new Touch({ identifier: 0, target: element, clientX });
    element.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(250)], bubbles: true }));
    element.dispatchEvent(new TouchEvent("touchend", { changedTouches: [touch(80)], bubbles: true }));
  });
  await expect(status).toHaveText("2 / 4");
  await viewer.getByRole("button", { name: "Open larger product image" }).click();
  const zoom = page.getByRole("dialog", { name: /enlarged image/ });
  await expect(zoom.locator("img")).toHaveAttribute("src", photos[1]);
  await zoom.getByRole("button", { name: "View next product image" }).click();
  await expect(status).toHaveText("3 / 4");
  await zoom.getByRole("button", { name: "Close enlarged image" }).click();
  await expect(zoom).toHaveCount(0);
  await page.reload();
  await expect(status).toHaveText("1 / 4");
  await expect(thumbs).toHaveCount(4);
  // Actual client-side route transition, not a new document.
  await page.locator('a[href="/product/defined-options"]').first().click();
  await expect(status).toHaveText("1 / 1");
  await expect(thumbs).toHaveCount(0);
  await viewer.getByRole("button", { name: "View next product image" }).click();
  await expect(status).toHaveText("1 / 1");
  await page.locator('a[href="/product/military-style-jacket"]').first().click();
  await expect(status).toHaveText("1 / 4");
});

for (const width of [390, 820]) {
  test(`multi-image gallery preserves the responsive layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixtures(page);
    await page.goto("/product/military-style-jacket");
    await expect(page.locator(".gallery-thumbnail")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(".gallery-viewer").getByRole("button", { name: "View next product image" }).click();
    await expect(page.locator(".gallery-pagination-status")).toHaveText("2 / 2");
  });
}

test("recovered real catalog loads four distinct durable tracksuit views in a fresh shopper session", async ({ page, request }) => {
  test.skip(process.env.VERIFY_RECOVERED_GALLERY !== "1", "Opt-in check against the repaired development catalog, without fixtures.");
  const response = await request.get("/api/catalog");
  expect(response.ok()).toBe(true);
  const real = await response.json();
  const tracksuit = real.products.find((product: { id: number }) => product.id === 109);
  expect(tracksuit.galleryImages).toEqual([
    "/objects/uploads/e21d69ba-69d0-4f17-9521-fc6936bc2f4e",
    "/objects/uploads/96ba7ef5-6e5c-4e08-aa34-d5dc0835d9ce",
    "/objects/uploads/742554e7-72d4-4f08-acab-0f205c9a14e3",
  ]);
  for (const path of tracksuit.galleryImages) {
    const media = await request.get(`/api/storage${path}`);
    expect(media.ok()).toBe(true);
    expect(media.headers()["content-type"]).toMatch(/^image\//);
  }
  await page.goto("/product/mesh-floral-sleeve-tracksuit");
  await expect(page.locator(".gallery-thumbnail")).toHaveCount(4);
  const sources = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.locator(".gallery-thumbnail").nth(i).click();
    const main = page.locator(".gallery-image img");
    await expect(main).toBeVisible();
    await expect.poll(() => main.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    sources.add((await main.getAttribute("src"))!);
    await expect(page.locator(".gallery-pagination-status")).toHaveText(`${i + 1} / 4`);
  }
  expect(sources.size).toBe(4);
  await page.reload();
  await expect(page.locator(".gallery-thumbnail")).toHaveCount(4);
  await expect(page.locator(".gallery-pagination-status")).toHaveText("1 / 4");
});

test("reference-shop galleries are present on every real product and new clothing/bag galleries survive reload", async ({ page, request }) => {
  test.skip(process.env.VERIFY_REFERENCE_GALLERIES !== "1", "Opt-in check against the merchant-approved reference recovery, without fixtures.");
  const response = await request.get("/api/catalog");
  expect(response.ok()).toBe(true);
  const real = await response.json();
  expect(real.products).toHaveLength(15);
  for (const product of real.products) {
    expect(product.galleryImages, product.name).toHaveLength(3);
    expect(new Set(product.galleryImages).size, product.name).toBe(3);
  }
  for (const slug of ["aysemetric-sequin-dress", "mini-tote-bag"]) {
    await page.goto(`/product/${slug}`);
    const thumbs = page.locator(".gallery-thumbnail");
    await expect(thumbs).toHaveCount(4);
    await thumbs.nth(3).click();
    await expect(page.locator(".gallery-pagination-status")).toHaveText("4 / 4");
    await expect.poll(() => page.locator(".gallery-image img").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.reload();
    await expect(thumbs).toHaveCount(4);
    await expect(page.locator(".gallery-pagination-status")).toHaveText("1 / 4");
  }
});

test("Simple purchase, gallery, guest wishlist, bag and checkout use catalog truth", async ({ page }) => {
  await fixtures(page);
  await page.goto("/product/military-style-jacket");
  await expect(page.locator(".detail-price")).toHaveText("£17.25");
  await page.locator(".gallery-viewer").getByRole("button", { name: "View next product image" }).click();
  await expect(page.locator(".gallery-pagination-status")).toHaveText("2 / 2");
  await page.getByRole("button", { name: /Save.*wishlist/i }).first().click();
  await page.goto("/wishlist");
  await expect(page.locator(".wishlist-item-price")).toHaveText("£17.25");
  await page.goto("/product/military-style-jacket");
  await page.getByTestId("button-add-to-bag-108").click();
  await page.goto("/cart");
  await expect(page.locator(".cart-item-price")).toHaveText("£17.25");
  await page.goto("/checkout");
  await expect(page.locator(".checkout-order-item strong")).toHaveText("£17.25");
  await expect(page.locator(".checkout-order-item")).not.toContainText("One size");
});

test("Variable products advertise available variants and bag quotes the selection, never parent", async ({ page }) => {
  await fixtures(page);
  await page.goto("/product/defined-options");
  await expect(page.locator(".detail-price")).toHaveText("£24.50 – £26.50");
  await expect(page.getByTestId("button-add-to-bag-900")).toBeDisabled();
  await page.getByRole("combobox", { name: "Select size" }).selectOption("S");
  await expect(page.locator(".detail-price")).toHaveText("£24.50");
  await page.getByTestId("button-add-to-bag-900").click();
  await page.goto("/cart");
  await expect(page.locator(".cart-item-price")).toHaveText("£24.50");
  await page.goto("/checkout");
  await expect(page.locator(".checkout-order-item strong")).toHaveText("£24.50");
});

test("missing variants cannot quote a parent price or silently remove saved lines", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => localStorage.setItem("glam-me-cart-v1", '[{"productId":900,"variationId":999,"size":"S","quantity":1}]'));
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Some bag items are unavailable" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("£1.00");
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Some bag items are unavailable" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("glam-me-cart-v1")!)[0].variationId)).toBe(999);
});

test("FAQ, both returns URLs and product share configured policies without hardcoded promises", async ({ page }) => {
  await fixtures(page);
  for (const path of ["/faq", "/returns", "/delivery-returns", "/product/military-style-jacket"]) {
    await page.goto(path);
    if (path.startsWith("/product")) {
      await page.locator(".detail-accordion summary").filter({ hasText: /^Delivery/ }).click();
      await page.locator(".detail-accordion summary").filter({ hasText: /^Returns/ }).click();
    }
    await expect(page.locator(".delivery-information-table")).toContainText("£8.25");
    await expect(page.locator(".delivery-information-table")).toContainText("£123.00");
    await expect(page.locator(".delivery-information-table")).toContainText("Owner delivery description");
    await expect(page.locator("main")).toContainText("Owner-approved return content.");
    await expect(page.locator("main")).not.toContainText(/£3.95|28 days|21-Day Returns|5 working days/);
  }
});

test("empty and failed policies give contact guidance, not invented defaults", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/shipping-methods", (route) => route.fulfill({ json: { shippingMethods: [] } }));
  await page.route("**/api/return-information", (route) => route.fulfill({ json: { content: "" } }));
  await page.goto("/delivery-returns");
  await expect(page.locator(".business-policies")).toContainText("Return information is currently unavailable");
  await expect(page.locator(".business-policies")).toContainText("Delivery information is currently unavailable");
  await expect(page.locator(".business-policies")).not.toContainText(/£|21|28/);
  await page.route("**/api/shipping-methods", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/return-information", (route) => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await expect(page.locator(".business-policies")).toContainText("Contact us");
});

test("mobile dialog traps focus, dismisses with Escape, restores focus and clears inertness", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto("/");
  const trigger = page.getByTestId("button-menu-toggle");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeFocused();
  expect(await page.locator("main.page").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await page.evaluate(() => {
    const notice = document.createElement("button");
    notice.id = "test-background-notice";
    notice.textContent = "Background notice";
    document.getElementById("root")!.appendChild(notice);
  });
  await expect.poll(() => page.locator("#test-background-notice").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Shop all" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  expect(await page.locator("main.page").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  expect(await page.locator("#test-background-notice").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  await page.locator("#test-background-notice").evaluate((el) => el.remove());
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#header-search-form")).toBeVisible();
  await trigger.click();
  await expect(page.locator("#header-search-form")).toHaveCount(0);
  await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("link", { name: "Shop all" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("main.page").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  await trigger.click();
  await page.setViewportSize({ width: 1100, height: 844 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("main.page").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});

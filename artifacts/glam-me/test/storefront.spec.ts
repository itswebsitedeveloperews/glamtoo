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

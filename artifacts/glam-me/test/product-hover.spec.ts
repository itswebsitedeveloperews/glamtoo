import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  installHoverFixtures, expectNoUnexpectedRequests, media, previewProduct, companionProduct,
} from "./fixtures/hover-catalog";

test.use({ viewport: { width: 1440, height: 1000 } });

let fixture: Awaited<ReturnType<typeof installHoverFixtures>>;
test.beforeEach(async ({ page }) => { fixture = await installHoverFixtures(page); });
test.afterEach(async () => { await expectNoUnexpectedRequests(fixture); });

async function parkPointer(page: Page) {
  await page.mouse.move(0, 0);
  // Blur explicitly only when resetting a keyboard-focus test.
}

async function loaded(image: Locator, source: string) {
  await expect(image).toHaveAttribute("src", source);
  await expect.poll(() => image.evaluate((node: HTMLImageElement, expected) =>
    node.complete && node.naturalWidth > 0 && new URL(node.currentSrc).pathname === expected,
  source)).toBe(true);
}

async function expectPreview(page: Page, card: Locator, second = media.second) {
  const images = card.locator(".listing-product-images");
  await expect(images).toHaveCount(1);
  await images.scrollIntoViewIfNeeded();
  await parkPointer(page);
  const primary = images.locator("img").first();
  const alternate = images.locator(".listing-product-image-secondary");
  await loaded(primary, media.primary);
  await loaded(alternate, second);
  await expect(alternate).toHaveAttribute("alt", "");
  await expect(alternate).toHaveAttribute("aria-hidden", "true");
  await expect(alternate).toHaveCSS("opacity", "0");
  await card.hover();
  await expect(alternate).toHaveCSS("opacity", "1");
  // Ensure the loaded alternate actually covers the primary, not a hidden or
  // zero-sized child. toBeVisible alone would also accept opacity:0.
  await expect.poll(() => images.evaluate((node) => {
    // The storefront also animates image scale. Sample both rectangles in one
    // frame and wait for that independent transition, not a fixed sleep.
    const [first, second] = [...node.querySelectorAll("img")].map((img) => img.getBoundingClientRect());
    if (!first.width || !first.height || !second.width || !second.height) return Infinity;
    return Math.max(...(["x", "y", "width", "height"] as const).map((key) => Math.abs(first[key] - second[key])));
  })).toBeLessThan(1);
  await parkPointer(page);
  await expect(alternate).toHaveCSS("opacity", "0");
  await expect(primary).toHaveCSS("opacity", "1");
  await loaded(primary, media.primary);
}

const placements = ["category", "Shop", "Obsessions", "moment", "related", "wishlist", "search", "recommendation"] as const;
async function openPlacement(page: Page, placement: typeof placements[number]) {
  if (placement === "wishlist") {
    await page.addInitScript((id) => localStorage.setItem("glam-me-wishlist-v1", JSON.stringify([id])), previewProduct.id);
  }
  const paths: Partial<Record<typeof placements[number], string>> = {
    category: "/category/dresses", Shop: "/shop", related: `/product/${companionProduct.slug}`, wishlist: "/wishlist",
  };
  await page.goto(paths[placement] || "/");
  if (placement === "search") {
    await page.getByTestId("button-search").click();
    await page.getByRole("searchbox", { name: "Search products" }).fill("Hover fixture");
    return page.locator(".header-search-result").filter({ hasText: previewProduct.name });
  }
  if (placement === "recommendation") {
    await page.goto(`/product/${companionProduct.slug}`);
    await page.getByTestId(`button-add-to-bag-${companionProduct.id}`).click();
    return page.getByTestId(`card-cart-rec-${previewProduct.id}`);
  }
  if (placement === "wishlist") return page.locator(".wishlist-item").filter({ hasText: previewProduct.name });
  if (placement === "moment") return page.getByTestId("card-moment-0");
  if (placement === "related") return page.getByTestId("section-related-products").getByTestId(`card-product-${previewProduct.id}`);
  return page.getByTestId(`card-product-${previewProduct.id}`);
}

for (const placement of placements) {
  test(`${placement}: exact second detail-gallery photo appears on hover and primary returns on exit`, async ({ page }) => {
    const card = await openPlacement(page, placement);
    await expectPreview(page, card);
    // Independent oracle: verify the real detail gallery's normalized order,
    // not just a second URL copied into every listing by mistake.
    await page.goto(`/product/${previewProduct.slug}`);
    const thumbnails = page.locator(".gallery-thumbnail img");
    await expect(thumbnails).toHaveCount(3);
    expect(await thumbnails.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src"))))
      .toEqual([media.primary, media.second, media.third]);
  });
}

test("detail-gallery ordering matches previews, removing repeated primary/secondary entries", async ({ page }) => {
  fixture.catalog.products[0].galleryImages = [
    media.primary, media.primary, ` ${media.second} `, media.second, "", media.third,
  ];
  await page.goto(`/product/${previewProduct.slug}`);
  const thumbnails = page.locator(".gallery-thumbnail img");
  await expect(thumbnails).toHaveCount(3);
  expect(await thumbnails.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src"))))
    .toEqual([media.primary, media.second, media.third]);
  await expectPreview(page, await openPlacement(page, "Shop"));
});

for (const gallery of [[], [media.primary], [media.primary, media.primary, ""]]) {
  test(`single-image gallery ${JSON.stringify(gallery)} never creates or requests an alternate`, async ({ page }) => {
    fixture.catalog.products[0].galleryImages = gallery;
    const card = await openPlacement(page, "Shop");
    await card.hover();
    await loaded(card.locator(".listing-product-images img"), media.primary);
    await expect(card.locator(".listing-product-image-secondary")).toHaveCount(0);
    await parkPointer(page);
    expect(fixture.requests).not.toContain(media.second);
    expect(fixture.requests).not.toContain(media.third);
  });
}

test("failed alternate leaves the loaded primary usable and link navigable", async ({ page }) => {
  fixture.failures.add(media.second);
  const card = await openPlacement(page, "Shop");
  await card.hover();
  await expect.poll(() => fixture.requests.includes(media.second)).toBe(true);
  await expect(card.locator(".listing-product-image-secondary")).toHaveCount(0);
  await expect(card.locator(".listing-product-images")).not.toHaveClass(/is-ready/);
  const primary = card.locator(".listing-product-images img");
  await loaded(primary, media.primary);
  await expect(primary).toHaveCSS("opacity", "1");
  await parkPointer(page);
  await loaded(primary, media.primary);
  await card.locator(".product-card-image-link").click();
  await expect(page).toHaveURL(new RegExp(`/product/${previewProduct.slug}$`));
});

test("slow alternate stays transparent until load; refresh does not show a stale second photo", async ({ page }) => {
  let release!: () => void;
  fixture.holds.set(media.replacement, new Promise<void>((resolve) => { release = resolve; }));
  const card = await openPlacement(page, "Shop");
  await expectPreview(page, card);
  await card.hover();
  const requestsBefore = fixture.catalogRequests;
  fixture.catalog.products[0].galleryImages = [media.primary, media.replacement, media.second];
  await page.evaluate(() => window.dispatchEvent(new Event("glam-catalog-updated")));
  await expect.poll(() => fixture.catalogRequests).toBeGreaterThan(requestsBefore);
  const alternate = card.locator(".listing-product-image-secondary");
  await expect(alternate).toHaveAttribute("src", media.replacement);
  await expect(alternate).toHaveCSS("opacity", "0");
  await expect(card.locator(".listing-product-images")).not.toHaveClass(/is-ready/);
  await loaded(card.locator(".listing-product-images img").first(), media.primary);
  release();
  await loaded(alternate, media.replacement);
  await expect(alternate).toHaveCSS("opacity", "1");
  await expectPreview(page, card, media.replacement);
});

test("keyboard focus previews without changing the accessible link or adding a tab stop", async ({ page }) => {
  const card = await openPlacement(page, "Shop");
  await card.scrollIntoViewIfNeeded();
  await parkPointer(page);
  const link = card.locator(".product-card-image-link");
  const alternate = card.locator(".listing-product-image-secondary");
  await loaded(alternate, media.second);
  // Put focus immediately before the image link, then enter it with a real Tab.
  await link.evaluate((node) => {
    const before = document.createElement("button");
    before.id = "hover-test-focus-start";
    node.before(before);
    before.focus();
  });
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(link).toHaveAccessibleName(`View ${previewProduct.name}`);
  expect(await link.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  await expect(alternate).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(link).not.toBeFocused();
  await expect(alternate).toHaveCSS("opacity", "0");
  await expect(alternate).not.toHaveAttribute("tabindex", "0");
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/product/${previewProduct.slug}$`));
});

test("reduced motion keeps the preview and restore behavior but removes the fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await openPlacement(page, "Shop");
  await expectPreview(page, card);
  await expect(card.locator(".listing-product-image-secondary")).toHaveCSS("transition-duration", "0s");
});

test.describe("touch-only", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("never downloads alternates and the first tap navigates normally", async ({ page }) => {
    const card = await openPlacement(page, "Shop");
    expect(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(false);
    await card.scrollIntoViewIfNeeded();
    await loaded(card.locator(".listing-product-images img"), media.primary);
    await expect(card.locator(".listing-product-image-secondary")).toHaveCount(0);
    // Even a synthetic mouse hover must not enable the media-gated preview.
    await card.hover();
    await expect(card.locator(".listing-product-image-secondary")).toHaveCount(0);
    expect(fixture.requests).not.toContain(media.second);
    expect(fixture.requests).not.toContain(media.third);
    await card.locator(".product-card-image-link").tap();
    await expect(page).toHaveURL(new RegExp(`/product/${previewProduct.slug}$`));
    // The detail page may now request its own gallery thumbnails normally.
  });
});

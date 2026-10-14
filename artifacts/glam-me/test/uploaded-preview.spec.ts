import { test, expect } from "@playwright/test";

// Uses existing public catalog data, without mutations or replacing gallery records.
const upload = "/api/storage/objects/uploads/ba265db8-762b-41d8-aad5-a292bed40f9d";
test("uploaded listing preview keeps the primary visible while loading and zoom uses the original", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/storage/objects/uploads/*?preview=listing-v1&width=*", async route => {
    await gate;
    await route.continue();
  });
  await page.goto("/shop");
  const secondary = page.locator(`.listing-product-image-secondary[src^="${upload}?"]`).first();
  await secondary.scrollIntoViewIfNeeded();
  const wrapper = secondary.locator("..");
  await wrapper.hover();
  await expect(wrapper).not.toHaveClass(/is-ready/);
  const primary = wrapper.locator("img").first();
  await expect(primary).toBeVisible();
  await expect(secondary).toHaveCSS("opacity", "0");
  release();
  await expect(wrapper).toHaveClass(/is-ready/, { timeout: 30000 });
  await expect(secondary).toHaveCSS("opacity", "1");
  expect(await secondary.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("preview=listing-v1");

  await page.goto("/product/military-style-jacket");
  const thumbnail = page.locator(`.gallery-thumbnail:has(img[src="${upload}"])`);
  await thumbnail.click();
  await expect(page.locator(".gallery-image img")).toHaveAttribute("src", upload);
  await page.getByRole("button", { name: "Open larger product image" }).click();
  const zoom = page.locator(".gallery-lightbox img");
  await expect(zoom).toHaveAttribute("src", upload);
  await expect(zoom).toBeVisible();
});

test("touch-only shop downloads no listing alternates", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const previewRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("preview=listing-v1")) previewRequests.push(request.url());
  });
  await page.goto("/shop");
  await expect(page.locator(".listing-product-images").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect(page.locator(".listing-product-image-secondary")).toHaveCount(0);
  expect(previewRequests).toEqual([]);
  await context.close();
});

import { test, expect } from "@playwright/test";
import { adminCatalog, adminProducts, authorizedAdminModule } from "./fixtures/admin-products";

test("Products keeps the review panel absent and catalog controls visible", async ({ page }) => {
  const unexpected: string[] = [];
  const apiReads: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const fixtures: Record<string, unknown> = {
    "/api/seo/resolve": { status: 200, title: "Admin fixture", robots: "noindex, nofollow" },
    "/api/admin/access": { isAdmin: true },
    "/api/admin/catalog": adminCatalog,
    "/api/catalog": adminCatalog,
    "/api/inventory": { inventory: {} },
    "/api/admin/orders": { orders: [] },
    "/api/stripe/status": { connected: false, configured: false, mode: "unknown", paymentMethods: [] },
    "/api/account/wishlist": { productIds: [] },
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Fail closed before forwarding any non-read request, including auth.
    if (!["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.pathname.endsWith("/@clerk_react.js")) {
      return route.fulfill({ contentType: "application/javascript", body: authorizedAdminModule });
    }
    if (url.pathname.startsWith("/api/")) {
      apiReads.push(url.pathname);
      if (url.pathname in fixtures) return route.fulfill({ json: fixtures[url.pathname] });
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.pathname.includes("/v1/") || url.origin !== new URL(test.info().project.use.baseURL!).origin) {
      unexpected.push(`${request.method()} ${url.href}`);
      return route.abort();
    }
    if (request.resourceType() === "document") {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /<div id="root">[\s\S]*?<\/div><script id="public-storefront-data" type="application\/json">[\s\S]*?<\/script>/,
        '<div id="root"></div>',
      );
      return route.fulfill({ response, body });
    }
    return route.continue();
  });

  try {
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
    // Wait for shared fixture data, not a transient bundled catalog.
    await expect.poll(() => apiReads).toContain("/api/admin/catalog");
    await page.getByRole("navigation", { name: "Admin navigation" })
      .getByRole("button", { name: "Products", exact: true }).click();
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Add product", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Add product", exact: true })).toBeEnabled();
    const grid = main.locator(".admin-product-catalog-grid");
    await expect(grid).toBeVisible();
    await expect(grid.locator("article")).toHaveCount(adminProducts.length);
    for (const product of adminProducts) {
      const card = grid.getByTestId(`admin-card-product-${product.id}`);
      await expect(card).toBeVisible();
      await expect(card.getByText(product.name, { exact: true })).toBeVisible();
      await expect(card.getByText(product.status, { exact: true })).toBeVisible();
      const view = card.getByRole("link", { name: "View product", exact: true });
      await expect(view).toBeVisible();
      await expect(view).toHaveAttribute("href", `/product/${product.slug}`);
      const edit = card.getByRole("button", { name: "Edit product", exact: true });
      await expect(edit).toBeVisible();
      await expect(edit).toBeEnabled();
    }
    // Require absence from the DOM, not just hidden/collapsed styling.
    await expect(main.getByText(/product\s+information\s+review/i)).toHaveCount(0);
    expect(apiReads).toContain("/api/admin/access");
    expect(pageErrors).toEqual([]);
  } finally {
    expect(unexpected, "No unmocked API/auth calls or writes may leave this fixture").toEqual([]);
  }
});

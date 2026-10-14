import { expect, type Page } from "@playwright/test";
import { clerkEnvironment, signedOutClient } from "./clerk-environment";

export const media = {
  primary: "/__hover-fixtures/primary.svg",
  second: "/__hover-fixtures/second.svg",
  third: "/__hover-fixtures/third.svg",
  replacement: "/__hover-fixtures/replacement.svg",
  companion: "/__hover-fixtures/companion.svg",
};

export const previewProduct = {
  id: 8101, slug: "hover-fixture-dress", name: "Hover fixture dress", category: "Dresses",
  price: "£18.00", stock: 10, status: "Published", type: "Simple", description: "Isolated preview fixture",
  image: media.primary, position: "50% 50%", sku: "isolated-preview", variations: [],
  // A repeated primary must not become the alternate. The third image is a decoy.
  galleryImages: [media.primary, media.second, media.third],
};
export const companionProduct = {
  ...previewProduct, id: 8102, slug: "companion-fixture", name: "Companion fixture dress",
  image: media.companion, galleryImages: [media.companion],
};
export const hoverCatalog = {
  initialized: true,
  products: [previewProduct, companionProduct],
  categories: [{ id: 81, name: "Dresses", slug: "dresses", parentId: null, image: media.primary, description: "" }],
  homePage: { categoryIds: [81], obsessionIds: [8101], momentIds: [8101] },
};

/** Every test gets its own browser context and mutable, in-memory responses.
 * No catalog, wishlist, order, auth or storage write reaches the real services. */
export async function installHoverFixtures(page: Page) {
  const state = {
    catalog: structuredClone(hoverCatalog),
    requests: [] as string[],
    unexpected: [] as string[],
    failures: new Set<string>(),
    holds: new Map<string, Promise<void>>(),
    catalogRequests: 0,
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.startsWith("/__hover-fixtures/")) {
      state.requests.push(url.pathname);
      await state.holds.get(url.pathname);
      if (state.failures.has(url.pathname)) return route.abort("failed");
      const colors: Record<string, string> = {
        [media.primary]: "#ed91b3", [media.second]: "#175fe6", [media.third]: "#16a34a",
        [media.replacement]: "#f97316", [media.companion]: "#a855f7",
      };
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="160" height="200" fill="${colors[url.pathname]}"/></svg>`,
      });
    }
    if (request.method() === "GET" && request.resourceType() === "document") {
      const response = await route.fetch();
      // Remove any merchant SSR snapshot; keep Vite's entry/refresh bootstrap.
      const body = (await response.text()).replace(
        /<div id="root">[\s\S]*?<\/div><script id="public-storefront-data" type="application\/json">[\s\S]*?<\/script>/,
        '<div id="root"></div>',
      );
      return route.fulfill({ response, body });
    }
    if (url.pathname.includes("/v1/")) {
      if (request.method() === "POST" && url.pathname.endsWith("/dev_browser")) {
        return route.fulfill({ json: { id: "dev_browser_isolated_not_a_token" } });
      }
      if (["GET", "POST"].includes(request.method()) && url.pathname.endsWith("/environment")) {
        return route.fulfill({ json: clerkEnvironment });
      }
      if (request.method() === "GET" && url.pathname.endsWith("/client")) {
        return route.fulfill({ json: { response: signedOutClient, client: signedOutClient } });
      }
    } else if (["GET", "HEAD"].includes(request.method())) {
      if (url.pathname.startsWith("/api/__clerk/npm/") && /\.(js|css)$/.test(url.pathname)) return route.continue();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/catalog") {
        state.catalogRequests++;
        return route.fulfill({ json: state.catalog });
      }
      const responses: Record<string, unknown> = {
        "/api/seo/resolve": { status: 200, title: "Isolated hover previews", robots: "noindex, nofollow" },
        "/api/inventory": { inventory: { "8101": 10, "8102": 10 } },
        "/api/shipping-methods": { shippingMethods: [] },
        "/api/stripe/product-sales": { sales: {} },
        "/api/return-information": { content: "" },
        "/api/size-guide": { sizeGuide: [] },
      };
      if (url.pathname in responses) return route.fulfill({ json: responses[url.pathname] });
      if (url.pathname === "/api/stripe/payment-config") {
        return route.fulfill({ status: 503, json: { error: "Payments disabled in hover fixtures" } });
      }
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  return state;
}

export async function expectNoUnexpectedRequests(state: Awaited<ReturnType<typeof installHoverFixtures>>) {
  expect(state.unexpected, "Unmocked APIs and all non-fixture mutations must remain blocked").toEqual([]);
}

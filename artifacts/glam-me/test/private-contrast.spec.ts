import { test, expect, type Page } from "@playwright/test";
import { clerkEnvironment, signedOutClient } from "./fixtures/clerk-environment";
import { expectControlContrast, expectTextContrast } from "./helpers/contrast";

const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='pink'/%3E%3C/svg%3E";
const product = {
  id: 108, slug: "isolated-jacket", name: "Receipt fixture jacket", category: "Clothes",
  price: "£25.00", stock: 5, status: "Published", type: "Simple", description: "",
  image, position: "50% 50%", sku: "isolated", variations: [],
};
const ownedOrder = {
  id: "ORDER-ISOLATED", placedAt: "2026-01-01T12:00:00Z", status: "Processing",
  paymentStatus: "paid", paymentResolution: "none", total: 2600, subtotal: 2500,
  deliveryAmount: 400, discountAmount: 300, vatAmount: 433, couponCode: "FIXTURE", currency: "GBP",
  email: "receipt@example.invalid",
  delivery: { method: "Standard", name: "Test Shopper", address: { line1: "1 Test Street", line2: "", city: "Test Town", postcode: "TE1 1ST", country: "GB" } },
  items: [{ name: product.name, productId: "108", quantity: 1, total: 2500 }],
};
const unexpectedRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const unexpected: string[] = [];
  // Keep Vite's transformed entry (including React refresh initialization), but
  // remove public SSR data so only the isolated browser API fixtures own state.
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /<div id="root">[\s\S]*?<\/div><script id="public-storefront-data" type="application\/json">[\s\S]*?<\/script>/,
        '<div id="root"></div>',
      );
      return route.fulfill({ response, body });
    }
    // Static SDK scripts still run; every auth API response is synthetic.
    if (url.pathname.includes("/v1/")) {
      if (request.method() === "POST" && url.pathname.endsWith("/dev_browser")) return route.fulfill({ json: { id: "dev_browser_isolated_not_a_token" } });
      // Clerk bootstraps development settings with POST as well as GET. Both
      // return only local synthetic settings; neither reaches the auth service.
      if (["GET", "POST"].includes(request.method()) && url.pathname.endsWith("/environment")) return route.fulfill({ json: clerkEnvironment });
      if (request.method() === "GET" && url.pathname.endsWith("/client")) return route.fulfill({ json: { response: signedOutClient, client: signedOutClient } });
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    // In the proxied preview, static Clerk bundles use the API prefix too.
    // This exception allows assets only, never Frontend API operations.
    if (url.pathname.startsWith("/api/__clerk/npm/") && /\.(js|css)$/.test(url.pathname)) return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const fixtures: Record<string, unknown> = {
      "/api/seo/resolve": { status: 200, title: "Isolated private contrast fixture", robots: "noindex, nofollow" },
      "/api/catalog": { initialized: true, products: [product], categories: [], homePage: { categoryIds: [], obsessionIds: [], momentIds: [] } },
      "/api/inventory": { inventory: { "108": 5 } },
      "/api/shipping-methods": { shippingMethods: [{ id: "isolated", name: "Standard", description: "Fixture delivery", price: 400, freeOver: 7500, enabled: true, sortOrder: 0 }] },
      "/api/stripe/product-sales": { sales: {} },
      "/api/return-information": { content: "" },
      "/api/size-guide": { sizeGuide: [] },
    };
    if (url.pathname === "/api/stripe/payment-config") return route.fulfill({ status: 503, json: { error: "Payments disabled in isolated contrast fixtures" } });
    if (url.pathname in fixtures) return route.fulfill({ json: fixtures[url.pathname] });
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  // Checked after every test, including retries: no payment/account writes can
  // slip through a fixture typo or a newly introduced endpoint.
  test.info().annotations.push({ type: "fixture", description: "All orders and Clerk clients are synthetic; mutations blocked" });
  unexpectedRequests.set(page, unexpected);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedRequests.get(page), "No unmocked API calls or provider mutations").toEqual([]);
});

async function checkReceipt(page: Page) {
  const receipt = page.locator(".ocv");
  await expect(receipt).toBeVisible();
  await expectTextContrast(receipt);
  const controls = receipt.locator("a, button");
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) await expectControlContrast(page, control);
}

for (const accountCreation of [undefined, "created", "existing", "pending"] as const) {
  test(`owned receipt contrast: ${accountCreation ?? "confirmed"}`, async ({ page }) => {
    let finalizations = 0;
    await page.route("**/api/stripe/finalize-payment", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ paymentIntentId: "pi_isolated_receipt" });
      finalizations++;
      await route.fulfill({ json: { order: { ...ownedOrder, accountCreation } } });
    });
    await page.goto("/order-confirmation?payment_intent=pi_isolated_receipt");
    await expect(page.getByRole("heading", { name: "Thank you for your order." })).toBeVisible();
    await expect(page.locator(".ocv-items")).toContainText(product.name);
    await expect(page.locator(".ocv-items .ocv-num")).toHaveText(["£25.00"]);
    await expect(page.locator(".ocv-totals dd")).toHaveText(["£25.00", "£4.00", "-£3.00", "£4.33", "£26.00"]);
    if (accountCreation) {
      const status = page.getByTestId("confirmation-account-status");
      await expect(status).toContainText({
        created: "Your account has been created", existing: "An account already uses", pending: "account creation is still pending",
      }[accountCreation]);
      await expect(status.locator("a, button")).toHaveText({
        created: "Set your password", existing: "Sign in", pending: "Retry account creation",
      }[accountCreation]);
    }
    await checkReceipt(page);
    expect(finalizations).toBe(1);
    if (!accountCreation) {
      // Prove that returning the former white foreground really fails, rather
      // than trusting a test that could accidentally inspect the wrong nodes.
      const regression = await page.addStyleTag({ content: ".ocv-btn { color: white !important; }" });
      await page.mouse.move(0, 0);
      await expect(expectTextContrast(page.locator(".ocv-btn").first())).rejects.toThrow("4.5:1");
      await regression.evaluate((el) => (el as Element).remove());
    }
  });
}

test("confirmation error and retry button contrast", async ({ page }) => {
  await page.route("**/api/stripe/finalize-payment", (route) => route.fulfill({ status: 503, json: { error: "Isolated confirmation unavailable. Please check again." } }));
  await page.goto("/order-confirmation?payment_intent=pi_isolated_receipt");
  await expect(page.locator(".ocv-alert")).toContainText("Isolated confirmation unavailable");
  await checkReceipt(page);
});

for (const [currency, total] of [["EUR", "€26.00"], ["INVALID", "26.00 INVALID"]]) {
  test(`receipt minor-unit formatting: ${currency}`, async ({ page }) => {
    await page.route("**/api/stripe/finalize-payment", (route) => route.fulfill({ json: { order: { ...ownedOrder, currency } } }));
    await page.goto("/order-confirmation?payment_intent=pi_isolated_receipt");
    await expect(page.locator(".ocv-totals .is-total dd")).toHaveText(total);
  });
}

test("confirming and missing-reference receipt text meets AA", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/stripe/finalize-payment", async (route) => {
    await pending;
    await route.fulfill({ json: { order: ownedOrder } });
  });
  await page.goto("/order-confirmation?payment_intent=pi_isolated_receipt");
  const confirming = page.locator(".ocv[aria-busy=true]");
  try {
    await expect(confirming).toBeVisible();
    await expectTextContrast(confirming);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "Thank you for your order." })).toBeVisible();
  await page.goto("/order-confirmation");
  await expect(page.getByRole("heading", { name: "We need your payment reference." })).toBeVisible();
  await checkReceipt(page);
});

for (const paymentResolution of ["refund_pending", "refund_processing", "refunded", "manual_resolution"]) {
  test(`refund presentation contrast: ${paymentResolution}`, async ({ page }) => {
    await page.route("**/api/stripe/finalize-payment", (route) => route.fulfill({ json: { order: { ...ownedOrder, status: "Cancelled", paymentResolution } } }));
    await page.goto("/order-confirmation?payment_intent=pi_isolated_receipt");
    await expect(page.locator(".ocv h1")).toContainText("Order cancelled");
    await expect(page.locator(".ocv-ref")).toContainText(ownedOrder.id);
    await expect(page.locator(".ocv-items")).toHaveCount(0);
    await checkReceipt(page);
  });
}

test("opened checkout sign-in modal text and button states meet normal-size AA", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("glam-me-cart-v1", '[{"productId":108,"size":"","quantity":1}]'));
  await page.goto("/checkout");
  await page.getByRole("link", { name: "Already have an account? Sign in" }).click();
  const modal = page.locator(".cl-modalContent");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".cl-formButtonPrimary")).toBeVisible();
  await modal.getByLabel("Email address", { exact: true }).fill("contrast@example.invalid");
  await modal.getByLabel("Password", { exact: true }).fill("Not-a-real-password");
  await expectTextContrast(modal);
  await expect(modal.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  await expect(modal.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
  const controls = modal.locator(".cl-formButtonPrimary, .cl-socialButtonsBlockButton, .cl-footerActionLink, .cl-formFieldAction");
  await expect(controls).toHaveCount(4);
  for (const control of await controls.all()) await expectControlContrast(page, control);
  const regression = await page.addStyleTag({ content: ".cl-formButtonPrimary:hover { background: #c96381 !important; color: white !important; transition: none !important; }" });
  await modal.locator(".cl-formButtonPrimary").hover();
  await expect(expectTextContrast(modal.locator(".cl-formButtonPrimary"))).rejects.toThrow("4.5:1");
  await regression.evaluate((el) => (el as Element).remove());
  // Do not submit, sign up, initiate OAuth, or change any customer's password.
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

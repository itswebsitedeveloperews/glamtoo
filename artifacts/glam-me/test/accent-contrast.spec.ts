import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";

const styles = [
  "../src/index.css",
  "../src/components/OrderConfirmationView.css",
].map((file) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/^@import .*;$/gm, "")).join("\n");

// CSS-only fixtures: no customer records, authentication or payment requests.
test("approved accent and button palettes keep readable ink in normal, hover and keyboard-focus states", async ({ page }) => {
  await page.setContent(`<style>${styles}</style><div id="root">
    <button class="button button-pink" data-check="primary">Shop now</button>
    <button class="product-shop-now" data-check="product">Shop now</button>
    <button class="detail-add-to-bag" data-check="bag">Add to bag</button>
    <button class="customer-recovery-button" data-check="recovery">Continue</button>
    <form class="newsletter-form"><button data-check="newsletter">Subscribe</button></form>
    <form class="footer-newsletter-form"><button data-check="footer-newsletter">→</button></form>
    <nav class="admin-nav"><button class="is-active" data-check="admin-selected">Overview</button></nav>
    <button class="admin-primary" data-check="admin-primary">Save</button>
    <button class="admin-secondary" data-check="admin-secondary">Cancel</button>
    <button class="admin-quiet-button" data-check="admin-quiet">Close</button>
    <button class="shop-filter-apply" data-check="filter-apply">Apply</button>
    <div class="checkout-coupon-form"><button data-check="coupon">Apply coupon</button></div>
    <div class="account-shortcuts"><button data-check="shortcut">Addresses</button></div>
    <div class="checkout-section-heading"><span data-check="checkout-step">1</span></div>
    <div class="header-tools"><a href="#" data-check="header-link">My account</a></div>
    <nav class="nav"><a href="#" data-check="sale-link">Sale</a></nav>
    <div class="faq-support"><span class="eyebrow" data-check="faq-label">Need help?</span></div>
    <div class="faq-group"><h2 data-check="faq-heading">Delivery</h2></div>
    <div class="faq-item" open><span class="faq-number" data-check="faq-number">01</span></div>
    <div class="moments"><div class="moments-heading"><span class="eyebrow" data-check="moments">Your moments</span></div></div>
    <div class="contact-care-head"><span class="eyebrow" data-check="contact">Contact us</span></div>
    <div class="account-nav"><button class="is-active" data-check="account-selected">Orders</button></div>
    <p class="variation-message" data-check="error">Choose an option</p>
    <div class="ocv"><span class="ocv-eyebrow" data-check="receipt-label">Thank you</span>
      <button class="ocv-btn" data-check="receipt-button">Continue shopping</button>
      <a class="ocv-link" href="#" data-check="receipt-link">View order</a>
      <p data-copy>Order received</p><small class="ocv-muted" data-support>Delivery details</small>
    </div>
    <input aria-label="Search" class="search-link" data-focus>
  </div>`);

  const readings: Array<{ name: string; state: string; contrast: number; background: string }> = [];
  for (const element of await page.locator("[data-check]").all()) {
    for (const state of ["normal", "hover", "focus"] as const) {
      await page.mouse.move(0, 0);
      await element.evaluate((node) => (node as HTMLElement).blur());
      if (state === "hover") await element.hover();
      if (state === "focus") await element.focus();
      const result = await element.evaluate((node) => {
        const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
        const over = (fg: number[], bg: number[]) => {
          const alpha = fg[3] ?? 1;
          return fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
        };
        const ancestors: Element[] = [];
        for (let parent: Element | null = node; parent; parent = parent.parentElement) ancestors.unshift(parent);
        let background = [255, 255, 255];
        for (const ancestor of ancestors) background = over(rgb(getComputedStyle(ancestor).backgroundColor), background);
        const computed = getComputedStyle(node);
        const foreground = over(rgb(computed.color), background);
        const luminance = (color: number[]) => color.map((v) => {
          const s = v / 255;
          return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const a = luminance(foreground), b = luminance(background);
        return { name: node.getAttribute("data-check")!, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), background: computed.backgroundColor };
      });
      readings.push({ ...result, state });
      expect(result.contrast, `${result.name} (${state})`).toBeGreaterThanOrEqual(4.5);
      if (["primary", "product", "bag", "recovery", "newsletter", "footer-newsletter", "admin-primary", "admin-secondary", "admin-quiet", "filter-apply", "coupon", "shortcut", "receipt-button"].includes(result.name)) {
        expect(result.background, `${result.name} must keep approved button shade (${state})`).toBe(
          state === "normal" ? "rgb(226, 61, 111)" : "rgb(201, 50, 96)",
        );
      }
      if (["admin-selected", "checkout-step"].includes(result.name)) {
        expect(result.background, `${result.name} must keep non-button accent (${state})`).toBe("rgb(201, 99, 129)");
      }
    }
  }
  for (const background of ["#fff", "#f5f1ed", "#c96381", "#171615"]) {
    await page.locator("body").evaluate((body, value) => { body.style.backgroundColor = value; }, background);
    const input = page.locator("[data-focus]");
    await input.focus();
    const focus = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
    });

async function expectReadableText(element: Locator) {
  const contrast = await element.evaluate((node) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map((value) => {
      const s = value / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    let background = [255, 255, 255];
    for (let parent: Element | null = node; parent; parent = parent.parentElement) {
      const color = rgb(getComputedStyle(parent).backgroundColor);
      if ((color[3] ?? 1) === 1) { background = color; break; }
    }
    const a = luminance(rgb(getComputedStyle(node).color)), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}
  await expect(headers).toHaveCount(4);
  for (const header of await headers.all()) {
    await expectReadableText(header);
    expect(await header.evaluate((node) => getComputedStyle(node).fontSize)).toBe("14px");
  }
});

  const faqLink = page.getByRole("link", { name: "VISIT OUR FAQ" });

  const headers = page.locator(".delivery-information-table th");

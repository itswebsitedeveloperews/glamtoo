import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Follow the existing CSS-only fixture convention: exercise the entire shipped
// cascade, but omit package font imports. No app, auth, API or saved data.
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
  .replace(/^@import .*;$/gm, "");
const states = ["normal", "hover", "keyboard-focus", "pressed"] as const;
type State = typeof states[number];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<!doctype html><style>${styles}</style><div id="root">
    <aside class="admin-sidebar is-menu-open"><nav class="admin-nav">
      <button type="button" class="is-active">Overview</button>
      <button type="button">Products</button>
    </nav></aside>
  </div>`);
  // Headless Chromium can leave about:blank fixtures without pointer pseudo
  // states until the page is foregrounded. Never mistake that for passing CSS.
  await page.bringToFront();
  await page.mouse.move(-1, -1);
});

async function enterState(page: Page, button: Locator, state: State) {
  if (state === "hover") await button.hover();
  if (state === "keyboard-focus") {
    // Real Tab focus, without hover masking a missing :focus-visible rule.
    for (let step = 0; step < 3; step++) {
      await page.keyboard.press("Tab");
      if (await button.evaluate((el) => el === document.activeElement)) break;
    }
  }
  if (state === "pressed") {
    await button.hover();
    await page.mouse.down();
    // Hold :active but remove :hover, so the hover rule cannot mask a missing
    // pressed rule. Mouse focus must not substitute for keyboard focus either.
    await page.mouse.move(-1, -1);
  }
  await expect.poll(() => button.evaluate((el) => ({
    hover: el.matches(":hover"),
    focus: el.matches(":focus-visible"),
    active: el.matches(":active"),
  }))).toEqual({
    hover: state === "hover",
    focus: state === "keyboard-focus",
    active: state === "pressed",
  });
}

async function expectColors(button: Locator, background: string, foreground: string, timeout = 5000) {
  // Poll computed paint until the real finite CSS transitions have settled.
  await expect(button).toHaveCSS("background-color", background, { timeout });
  await expect(button).toHaveCSS("color", foreground, { timeout });
}

for (const state of states) {
  test(`active admin navigation keeps the approved action palette: ${state}`, async ({ page }) => {
    const button = page.getByRole("button", { name: "Overview", exact: true });
    await enterState(page, button, state);
    try {
      const token = state === "normal" ? "--button-bg" : "--button-hover-bg";
      const approved = state === "normal" ? "rgb(226, 61, 111)" : "rgb(201, 50, 96)";
      await expectColors(button, approved, "rgb(255, 255, 255)");

      // Also prove the selector follows the action token, not a coincidentally
      // matching hardcoded pink. This mutation exists only in this fresh page.
      await page.evaluate(({ token }) => {
        document.documentElement.style.setProperty(token, "rgb(12, 34, 56)");
      }, { token });
      await expectColors(button, "rgb(12, 34, 56)", "rgb(255, 255, 255)");
    } finally {
      if (state === "pressed") await page.mouse.up();
    }
  });

  test(`inactive admin navigation stays neutral: ${state}`, async ({ page }) => {
    const button = page.getByRole("button", { name: "Products", exact: true });
    await enterState(page, button, state);
    try {
      await expectColors(button,
        state === "hover" ? "rgb(42, 39, 37)" : "rgba(0, 0, 0, 0)",
        state === "hover" ? "rgb(255, 253, 251)" : "rgb(217, 209, 203)");
    } finally {
      if (state === "pressed") await page.mouse.up();
    }
  });
}

test("style oracle rejects lighter accent backgrounds and dark active text", async ({ page }) => {
  const button = page.getByRole("button", { name: "Overview", exact: true });
  for (const regression of [
    "background: var(--pink) !important",
    "color: var(--accent-ink) !important",
  ]) {
    const override = await page.addStyleTag({
      content: `.admin-nav button.is-active { ${regression}; transition: none !important; }`,
    });
    try {
      // Use the same oracle as the positive checks; short timeout for intentional
      // failures. Neither these checks nor the palette checks assert AA contrast.
      await expect(expectColors(button, "rgb(226, 61, 111)", "rgb(255, 255, 255)", 200)).rejects.toThrow();
    } finally {
      await override.evaluate((el) => el.remove());
    }
  }
});

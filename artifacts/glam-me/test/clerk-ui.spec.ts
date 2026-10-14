import { test, expect } from "@playwright/test";

// Real signed-out Clerk widgets: requires the web/API workflows and configured
// development Clerk instance. No credentials, account creation or email sends.
for (const path of ["/account", "/register", "/admin"]) {
  test(`pinned Clerk UI preserves readable embedded controls on ${path}`, async ({ page }) => {
    const warnings: string[] = [];
    const remoteUiRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    page.on("request", (request) => {
      if (/\/npm\/@clerk\/ui@|\/ui\.browser\.js/.test(request.url())) {
        remoteUiRequests.push(request.url());
      }
    });

    await page.goto(path);
    const widget = page.locator(path === "/register" ? ".cl-signUp-root" : ".cl-signIn-root");
    await expect(widget).toBeVisible({ timeout: 30000 });
    await expect(widget.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(widget.locator(".cl-headerTitle")).toBeVisible();
    const email = widget.getByRole("textbox", { name: "Email address", exact: true });
    await expect(email).toBeVisible();
    await expect(email).toHaveCSS("font-size", "16px");
    await email.fill("widget-check@example.invalid");
    await expect(email).toHaveValue("widget-check@example.invalid");

    // Check keyboard focus rather than programmatically forcing :focus-visible.
    await email.focus();
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    if (await focused.evaluate((node) => node.matches("input, select, textarea"))) {
      // Editable fields use the merchant-approved inset focus treatment.
      await expect(focused).toHaveCSS("outline-style", "none");
      await expect(focused).toHaveCSS("box-shadow", /inset/);
    } else {
      await expect(focused).toHaveCSS("outline-style", "solid");
      await expect(focused).toHaveCSS("outline-width", "2px");
    }

    const primary = widget.locator(".cl-formButtonPrimary");
    const social = widget.locator(".cl-socialButtonsBlockButton").first();
    for (const [button, normalBackground, hoverBackground, color] of [
      [primary, "rgb(226, 61, 111)", "rgb(201, 50, 96)", "rgb(255, 255, 255)"],
      [social, "rgb(255, 255, 255)", "rgb(250, 250, 250)", "rgb(23, 22, 21)"],
    ] as const) {
      await page.locator(":focus").evaluate((node) => (node as HTMLElement).blur());
      await page.mouse.move(0, 0);
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS("background-color", normalBackground);
      await expect(button).toHaveCSS("color", color);
      await button.hover();
      await expect(button).toHaveCSS("background-color", hoverBackground);
      await expect(button).toHaveCSS("color", color);
      await button.focus();
      await expect(button).toHaveCSS("background-color", hoverBackground);
      await expect(button).toHaveCSS("color", color);
    }
    expect(warnings.filter((warning) => /structural_css_pin_clerk_ui/.test(warning))).toEqual([]);
    expect(remoteUiRequests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(path);

    if (path === "/account") {
      await widget.getByRole("link", { name: "Sign up", exact: true }).click();
      await expect(page).toHaveURL(/\/register/);
      await expect(page.locator(".cl-signUp-root")).toBeVisible();
      await page.locator(".cl-signUp-root").getByRole("link", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/account/);
      await expect(page.locator(".cl-signIn-root")).toBeVisible();
    }
  });
}

import { expect, type Locator, type Page } from "@playwright/test";

/** Measure the rendered cascade, including translucent backgrounds, not palette tokens.
 * All text (including headings) deliberately has the normal-size AA floor of 4.5.
 * Unsupported paint effects fail explicitly rather than quietly passing a guessed ratio.
 */
export async function expectTextContrast(scope: Locator) {
  // Wait for real, finite CSS transitions before reading a state's colors.
  // This also keeps the deliberately failing mutation controls deterministic.
  await scope.evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
  const samples = await scope.evaluate((root) => {
    type Color = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    function color(value: string): Color {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (/^rgba?\(/.test(value) && parts && parts.length >= 3) return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      // Chromium may serialize color-mix()/hover colors as oklab(). Let the
      // browser convert that computed color to sRGB instead of guessing it.
      if (!CSS.supports("color", value)) throw new Error(`Unsupported color: ${value}`);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    }
    function over(fg: Color, bg: Color): Color {
      const a = fg[3] + bg[3] * (1 - fg[3]);
      return [0, 1, 2].map((i) => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a).concat(a) as Color;
    }
    function luminance(c: Color) {
      return c.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    }
    const elements = [root, ...root.querySelectorAll("*")].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      || el instanceof HTMLInputElement && el.value,
    );
    return elements.flatMap((el) => {
      const style = getComputedStyle(el);
      if (!(el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return [];
      const ancestors: Element[] = [];
      for (let parent: Element | null = el; parent; parent = parent.parentElement) ancestors.unshift(parent);
      let background: Color = [255, 255, 255, 1];
      for (const parent of ancestors) {
        const s = getComputedStyle(parent);
        if (s.backgroundImage !== "none" || s.filter !== "none" || Number(s.opacity) !== 1 || s.mixBlendMode !== "normal") {
          throw new Error(`Unmodelled paint effect on ${parent.className}: ${s.backgroundImage}, ${s.filter}, opacity ${s.opacity}`);
        }
        background = over(color(s.backgroundColor), background);
      }
      const foreground = over(color(style.color), background);
      const [a, b] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return [{
        text: (el instanceof HTMLInputElement ? el.value : [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("")).trim().slice(0, 100),
        selector: `${el.tagName}.${[...el.classList].join(".")}`,
        foreground: style.color, background, ratio: (a + .05) / (b + .05),
      }];
    });
  });
  expect(samples.length, "Contrast scope must contain visible text").toBeGreaterThan(0);
  expect(samples.filter((s) => s.ratio < 4.5), "Every visible text sample must meet normal-size AA (4.5:1)").toEqual([]);
}

/** Separate states: hover must not mask a focus-only regression. Tab, not .focus(),
 * activates the keyboard's real :focus-visible styling. Never activate the control.
 */
export async function expectControlContrast(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await control.evaluate((el) => (el as HTMLElement).blur());
  await expectTextContrast(control);
  await control.hover();
  await expectTextContrast(control);
  await page.mouse.move(0, 0);
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
  expect(await control.evaluate((el) => el.matches(":focus-visible")), "Real keyboard focus-visible state").toBe(true);
  await expectTextContrast(control);
  await control.evaluate((el) => (el as HTMLElement).blur());
}

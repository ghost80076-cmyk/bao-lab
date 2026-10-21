const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

for (const width of [390, 1280]) {
  test(`keyboard can bypass navigation on ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator("#home-view")).toHaveClass(/active/);

    const skip = page.getByRole("link", { name: "跳至主要內容" });
    await expect(skip).toHaveAttribute("href", "#app-main");
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    fs.mkdirSync("test-results/keyboard-main-entry", { recursive: true });
    await page.screenshot({
      path: `test-results/keyboard-main-entry/focused-${width}.png`,
      animations: "disabled"
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("main#app-main")).toBeFocused();
    await expect(page.locator("#home-view")).toHaveClass(/active/);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("skip target remains the current main region after SPA view changes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator("#explore-view")).toHaveClass(/active/);
  await page.locator(".yoru-skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#app-main")).toBeFocused();
  await expect(page.locator("#explore-view")).toHaveClass(/active/);
});

test("reduced-motion preference disables global smooth scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const mode = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(mode).toBe("auto");
});

test("story mode cards retain native keyboard operability", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.App?.characters?.length));
  await page.evaluate(() => App.showView("builder"));
  const advanced = page.locator('#bao-setup-choice [data-bao-setup="advanced"]');
  await expect(advanced).toBeVisible();
  await advanced.click();
  await expect(page.locator('.builder-step[data-step-panel="1"]')).toBeVisible();
  const immersive = page.locator('#builder-view input[name="narrative-mode"][value="immersive"]');
  const world = page.locator('#builder-view input[name="narrative-mode"][value="world"]');
  await immersive.focus();
  await expect(immersive).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(world).toBeFocused();
  await expect(world).toBeChecked();
  const focusOutline = await world.locator("..").evaluate(node => getComputedStyle(node).outlineStyle);
  expect(focusOutline).not.toBe("none");
});

const { test, expect } = require("@playwright/test");

// First paint must be the real landing page, not a placeholder replaced after JS loads.
for (const width of [390, 1280]) {
  test(`homepage has its final layout before JavaScript at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      javaScriptEnabled: false
    });
    try {
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const hero = page.locator("#home-view > .brand-cinematic-hero");
      await expect(hero).toBeVisible();
      await expect(page.locator("#home-view > .hero")).toHaveCount(0);
      await expect(page.locator("#home-start-story")).toBeVisible();
      const bounds = await hero.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.width).toBeLessThanOrEqual(width + 1);
    } finally {
      await context.close();
    }
  });
}

test("homepage enhancement preserves first-paint DOM and navigation", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      window.__firstPaintHomeHero = document.querySelector("#home-view > .brand-cinematic-hero");
    }, { once: true });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.App?.__baoNightHomeRefreshWrapped === true);
  await expect(page.locator("#home-start-story")).toBeVisible();
  expect(await page.evaluate(() =>
    window.__firstPaintHomeHero === document.querySelector("#home-view > .brand-cinematic-hero")
  )).toBe(true);
  await page.locator("#home-start-story").click();
  await expect(page.locator("#explore-view")).toHaveClass(/active/);
});

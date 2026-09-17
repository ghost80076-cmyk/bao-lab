const { test, expect } = require("@playwright/test");

const INVITE = "https://discord.gg/Mdvn2hdwe";

test.describe("BAO/LAB official identity and community contact", () => {
  test("world-core image, Discord icon and contact links appear on the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
    const artwork = page.locator(".brand-world-art");
    await expect(artwork).toBeVisible();
    await expect.poll(() => artwork.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const nav = page.locator("#bao-discord-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator('img[src="assets/discord-mark.svg"]')).toBeVisible();
    await expect(nav).toHaveAttribute("href", INVITE);
    await expect(nav).toHaveAttribute("target", "_blank");
    await expect(nav).toHaveAttribute("rel", /noopener/);
    await expect(page.locator("#home-view .brand-contact")).toContainText("聯絡我們");
    await expect(page.locator("#home-view .brand-contact a")).toHaveAttribute("href", INVITE);
    await expect(page.locator("#bao-contact-footer a")).toHaveAttribute("href", INVITE);
    await page.locator("#bao-contact-nav").click();
    await expect(page.locator("#about-view.active #contact")).toBeVisible();
    await expect(page.locator("#about-view #contact a")).toHaveAttribute("href", INVITE);
  });

  test("mobile navigation and official art fit without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".brand-world-art")).toBeVisible();
    await expect(page.locator("#bao-discord-nav")).toHaveAttribute("href", INVITE);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, navScroll: document.querySelector('.topbar nav').scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.navScroll).toBeGreaterThanOrEqual(0);
  });
});

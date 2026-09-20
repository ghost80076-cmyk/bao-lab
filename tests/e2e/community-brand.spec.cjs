const { test, expect } = require('@playwright/test');

const INVITE = 'https://discord.gg/N3XpAhwTN';

test.describe('BAO/LAB official identity and community contact', () => {
  test('mascot art, Discord icon and contact links appear on the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home-view .brand-hero h1')).toContainText('選個角色');
    const artwork = page.locator('#bao-home-portrait');
    await expect(artwork).toBeVisible();
    await expect.poll(() => artwork.locator('img:not(.bao-portrait-bun)').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(artwork).toContainText('BAO · 包包');
    const nav = page.locator('#bao-discord-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('img[src="assets/discord-mark.svg"]')).toBeVisible();
    await expect(nav).toHaveAttribute('href', INVITE);
    await expect(nav).toHaveAttribute('target', '_blank');
    await expect(nav).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('#home-view .brand-contact')).toContainText('聯絡我們');
    await expect(page.locator('#home-view .brand-contact a')).toHaveAttribute('href', INVITE);
    await expect(page.locator('#bao-contact-footer a')).toHaveAttribute('href', INVITE);
    await page.locator('#bao-contact-nav').click();
    await expect(page.locator('#about-view.active #contact')).toBeVisible();
    await expect(page.locator('#about-view #contact a')).toHaveAttribute('href', INVITE);
  });

  test('mobile navigation and mascot hero fit without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#bao-home-portrait')).toBeVisible();
    await expect(page.locator('#bao-discord-nav')).toHaveAttribute('href', INVITE);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, navScroll: document.querySelector('.topbar nav').scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.navScroll).toBeGreaterThanOrEqual(0);
  });
});

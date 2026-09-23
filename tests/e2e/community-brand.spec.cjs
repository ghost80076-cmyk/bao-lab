const { test, expect } = require('@playwright/test');

const INVITE = 'https://discord.gg/N3XpAhwTN';

test.describe('BAO/LAB official identity and concise community entry', () => {
  test('Cinematic Night homepage keeps the character first and mascot subtle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home-view .brand-hero h1')).toContainText('今晚，想走進');
    await expect(page.locator('#home-feature-stage')).toBeVisible();
    await expect(page.locator('#home-view')).not.toContainText('SYSTEM READY');
    await expect(page.locator('#home-view .brand-reading-intro')).toHaveCount(0);
    await expect(page.locator('#home-view .brand-chapter-grid')).toHaveCount(0);
    const portrait = page.locator('#bao-home-portrait img:not(.bao-portrait-bun)');
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#bao-discord-nav')).toHaveCount(0);
    await expect(page.locator('#bao-contact-nav')).toHaveCount(0);
    await expect(page.locator('#home-view .brand-contact')).toHaveCount(0);
    await expect(page.locator('#home-view .brand-feature-grid')).toHaveCount(0);
    await expect(page.locator('#bao-contact-footer a')).toHaveAttribute('href', INVITE);
    await page.getByRole('button', { name: '關於 BAO/LAB' }).click();
    await expect(page.locator('#about-view.active')).toContainText('讓故事回到玩家手中');
    await expect(page.locator('#about-view.active')).toContainText('角色 · 世界 · 互動 · 自己的 AI');
  });

  test('mobile navigation and mascot hero fit without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#bao-home-portrait')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, navScroll: document.querySelector('.topbar nav').scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.navScroll).toBeGreaterThanOrEqual(0);
  });
});

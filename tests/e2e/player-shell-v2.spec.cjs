const { test, expect } = require('@playwright/test');

test.describe('Player 2.0 shell', () => {
  test('mobile uses a simple Home / Stories / My navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const nav = page.locator('#bao-mobile-nav');
    await expect(nav).toBeVisible({ timeout: 10000 });
    await expect(nav.locator('[data-player-nav]')).toHaveCount(3);
    await expect(page.locator('.topbar nav')).toBeHidden();

    await nav.locator('[data-player-nav="me"]').click();
    await expect(page.locator('#me-view')).toHaveClass(/active/);
    await expect(page.locator('#me-view a[href="account.html"]')).toBeVisible();
    await expect(page.locator('#bao-player-account-state')).toContainText(/未登入|已登入/);

    await nav.locator('[data-player-nav="home"]').click();
    await expect(page.locator('#home-view')).toHaveClass(/active/);
  });

  test('desktop keeps the top navigation and exposes My without a bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#bao-me-nav')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#bao-mobile-nav')).toBeHidden();

    await page.locator('#bao-me-nav').click();
    await expect(page.locator('#me-view')).toHaveClass(/active/);
    await expect(page.locator('#me-view')).toContainText('Local-first');
  });
});

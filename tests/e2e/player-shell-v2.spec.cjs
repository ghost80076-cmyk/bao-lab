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
  test('work discovery searches current cards and keeps local author tools collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.evaluate(() => App.showView('explore'));
    await expect(page.locator('#bao-work-search')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#explore-view .bao-gallery-more')).toBeVisible();
    await expect(page.locator('#explore-view .bao-gallery-more')).not.toHaveAttribute('open', '');

    const total = await page.locator('#character-list .character-card').count();
    expect(total).toBeGreaterThan(1);
    await page.locator('#bao-work-search').fill('林沉風');
    await expect(page.locator('#character-list .character-card:visible')).toHaveCount(1);
    await expect(page.locator('#character-list .character-card:visible')).toContainText('林沉風');
  });

  test('story play surface keeps reading dominant and advanced tools secondary', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.locator('#home-view button[data-view="explore"]').click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
    await page.locator('#bao-demo-mode').check();
    await page.locator('#next-step').click();
    await page.locator('#start-story').click();

    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(page.locator('#bao-surface-mode-toggle')).toHaveText('工具');
    await expect(page.locator('#chat-view .usage-bar')).toBeHidden();
    await expect(page.locator('#chat-view .chat-layout > aside').first()).toBeHidden();
    await expect(page.locator('#chat-stream')).toHaveAttribute('aria-label', '故事內容');
    const assistant = page.locator('#chat-view .message.assistant .bubble').first();
    await expect(assistant).toBeVisible();
    expect((await assistant.boundingBox()).width).toBeLessThan(800);

    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
    await expect(page.locator('#bao-surface-mode-toggle')).toHaveText('返回故事');
    await expect(page.locator('#chat-view .usage-bar')).toBeVisible();
  });

});

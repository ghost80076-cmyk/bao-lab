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
    await expect(page.locator('.topbar nav a[href="account.html"]')).toBeHidden();
    await expect(page.locator('.topbar nav a[href*="ko-fi.com"]')).toBeHidden();
    await expect(page.locator('.topbar nav [data-bao-regex-link]')).toBeHidden();
    await expect(page.locator('.topbar nav #bao-drive-button')).toBeHidden();

    await page.locator('#bao-me-nav').click();
    await expect(page.locator('#me-view')).toHaveClass(/active/);
    await expect(page.locator('#me-view')).toContainText('Local-first');
    await expect(page.locator('#me-view a[href="account.html"]')).toBeVisible();
    await expect(page.locator('#me-view a[href*="ko-fi.com"]')).toBeVisible();
  });
  test('work discovery searches current cards and keeps local author tools collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.evaluate(() => App.showView('explore'));
    await expect(page.locator('#bao-work-search')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(120);
    await expect(page.locator('#explore-view .bao-gallery-more > summary')).toHaveAttribute('data-bao-player-styled', 'yes');
    await expect(page.locator('#explore-view .bao-gallery-more')).toBeVisible();
    await expect(page.locator('#explore-view .bao-gallery-more')).not.toHaveAttribute('open', '');

    const total = await page.locator('#character-list .character-card').count();
    expect(total).toBeGreaterThan(1);
    await expect(page.locator('#character-list .character-card img').first()).toHaveAttribute('loading', 'lazy');
    await expect(page.locator('#character-list .character-card img').first()).toHaveAttribute('decoding', 'async');
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
    expect((await assistant.boundingBox()).width).toBeLessThanOrEqual(860);

    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
    await expect(page.locator('#bao-surface-mode-toggle')).toHaveText('返回故事');
    await expect(page.locator('#chat-view .usage-bar')).toBeVisible();
  });

  test('quick builder separates account credits from BYOK without raw connection fields first', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#home-view button[data-view="explore"]').click();
    await page.locator('#character-list .character-card').first().click();
    await page.getByRole('button', { name: '開始故事' }).click();

    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'quick');
    await expect(page.locator('#bao-connection-mode')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#bao-connection-mode [data-bao-connection="byok"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#model-id').locator('xpath=..')).toBeHidden();

    await page.waitForFunction(() => Boolean(document.querySelector('#api-type option[value="bao-credits"]')));
    await page.locator('#bao-connection-mode [data-bao-connection="hosted"]').click();
    await expect(page.locator('#api-type')).toHaveValue('bao-credits');
    await expect(page.locator('#bao-connection-mode [data-bao-connection="hosted"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bao-connection-account')).toBeVisible();

    await page.locator('#bao-connection-mode [data-bao-connection="byok"]').click();
    await expect(page.locator('#api-type')).not.toHaveValue('bao-credits');
    await expect(page.locator('#bao-connection-mode [data-bao-connection="byok"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('BAO Account page matches the player shell on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/account.html');
    await expect(page.locator('.yb-account-hero h1')).toHaveText('帳號與 API 額度');
    await expect(page.locator('.yb-local-first')).toContainText('Local-first');
    await expect(page.locator('.yb-tabs')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  });

  test('work detail explains capabilities before story setup', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#home-view button[data-view="explore"]').click();
    await page.locator('#character-list .character-card').first().click();
    await expect(page.locator('#detail-view .bao-work-detail-v2')).toBeVisible();
    await expect(page.locator('#detail-view .bao-detail-feature-strip')).toBeVisible();
    await expect(page.locator('#detail-view .bao-detail-feature-strip')).toContainText('Local-first');
    await expect(page.locator('#detail-view .bao-detail-start-note')).toContainText('先選故事，再選 AI');
    await expect(page.locator('#detail-start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  });

});

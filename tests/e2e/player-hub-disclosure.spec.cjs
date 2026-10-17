const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`My hub keeps main tasks visible, secondary tools accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => !!window.YoruExperience && !!window.BAOPlayerShellV2);
    await page.evaluate(() => {
      window.YoruExperience.choose({theme:'mist',level:'easy'});
      App.showView('me');
    });

    const view = page.locator('#me-view');
    const more = view.locator('[data-bao-player-more]');
    await expect(view.getByRole('button', { name: '打開故事書庫' })).toBeVisible();
    await expect(view.getByRole('button', { name: '打開我的人物庫' })).toBeVisible();
    await expect(view.getByRole('button', { name: '調整外觀' })).toBeVisible();
    await expect(view.locator('[data-bao-adult-content-toggle]')).toHaveCount(1);
    await expect(more).not.toHaveAttribute('open', '');
    await expect(view.getByRole('link', { name: '打開角色實驗室' })).toBeHidden();
    await more.locator('summary').click();
    await expect(more).toHaveAttribute('open', '');
    await expect(view.getByRole('link', { name: '打開角色實驗室' })).toBeVisible();
    await expect(view.getByRole('button', { name: '雲端故事' })).toBeVisible();
    await expect(view.getByRole('button', { name: '探索作品' })).toBeVisible();

    // Manual disclosure choices survive preference changes; no duplicate settings or lost handlers.
    await page.evaluate(() => window.YoruExperience.choose({theme:'dusk',level:'pro'}));
    await expect(more).toHaveAttribute('open', '');
    await expect(view.locator('[data-bao-experience-state]')).toHaveText('暮霞 · 專業');
    const bg = await more.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    await more.locator('summary').click();
    await expect(more).not.toHaveAttribute('open', '');
    await page.evaluate(() => window.YoruExperience.choose({level:'easy'}));
    await expect(more).not.toHaveAttribute('open', '');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width + 1);
  });
}

test('professional view initially expands secondary tools but does not change story state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  const stateBefore = await page.evaluate(() => JSON.stringify(window.GameState?.current ?? null));
  await page.evaluate(() => {
    window.YoruExperience.choose({level:'pro'});
    App.showView('me');
  });
  const more = page.locator('#me-view [data-bao-player-more]');
  await expect(more).toHaveAttribute('open', '');
  await expect(page.locator('#me-view a[href="account.html"]')).toBeVisible();
  await expect(page.locator('#me-view a[href*="ko-fi.com"]')).toBeVisible();
  const stateAfter = await page.evaluate(() => JSON.stringify(window.GameState?.current ?? null));
  expect(stateAfter).toBe(stateBefore);
});

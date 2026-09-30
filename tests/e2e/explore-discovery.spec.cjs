const { test, expect } = require('@playwright/test');

test('explore page lets players search works and filter capabilities without exposing R18 by default', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));

  await page.evaluate(() => App.showView('explore'));
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
  await expect(page.locator('#explore-view h2')).toContainText('故事');

  const tools = page.locator('#explore-discovery-tools');
  const input = tools.locator('#explore-search-input');
  await expect(tools).toBeVisible();
  await expect(input).toBeVisible();
  await expect(tools.getByRole('button', { name: '世界模擬', exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: '互動 UI', exact: true })).toBeVisible();

  const adultVisible = await page.locator('#character-list [data-character-id="desire-district"]:visible').count();
  expect(adultVisible).toBe(0);

  await input.fill('魔法學院');
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBe(1);
  await expect(page.locator('#character-list [data-character-id="night-sky-magic-academy"]')).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('目前顯示 1 個作品');

  await tools.getByRole('button', { name: '清除', exact: true }).click();
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBeGreaterThan(1);

  await page.evaluate(() => {
    if (!App.characters.some(item => item.id === 'explore-basic-e2e')) {
      App.characters.unshift(CharacterEngine.normalize({
        id: 'explore-basic-e2e',
        name: '純文字測試作品',
        title: '純文字測試作品',
        description: '沒有世界模擬也沒有互動 UI。',
        category: 'male',
        rating: 'general',
        tags: ['測試'],
        system_prompt: 'test',
        greeting: 'test',
        supported_modes: { immersive: true, world: false },
        supported_display: { text: true, ui: false },
        source: 'custom'
      }));
    }
    App.renderCharacters('all');
  });
  await expect(page.locator('#character-list [data-character-id="explore-basic-e2e"]')).toBeVisible();

  await tools.getByRole('button', { name: '世界模擬', exact: true }).click();
  await expect(page.locator('#character-list [data-character-id="explore-basic-e2e"]')).toBeHidden();

  await input.fill('純文字測試作品');
  await expect(page.locator('#explore-search-empty')).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('目前顯示 0 個作品');

  await tools.getByRole('button', { name: '重設篩選', exact: true }).click();
  await expect(page.locator('#character-list [data-character-id="explore-basic-e2e"]')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    toolsRight: document.getElementById('explore-discovery-tools').getBoundingClientRect().right
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.toolsRight).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('explore search matches tags and does not change the current category gate', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.getByRole('button', { name: '作品', exact: true }).click();

  const tools = page.locator('#explore-discovery-tools');
  const input = tools.locator('#explore-search-input');

  await input.fill('長篇');
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBeGreaterThan(0);

  await page.evaluate(() => {
    App.renderCharacters('female');
  });
  await expect(page.locator('#explore-view')).toHaveAttribute('data-category-theme', 'female');
  await input.fill('歌舞伎町');
  const visible = page.locator('#character-list [data-character-id]:visible');
  await expect.poll(() => visible.count()).toBeGreaterThan(0);

  const ids = await visible.evaluateAll(nodes => nodes.map(node => node.dataset.characterId));
  const categories = await page.evaluate(ids =>
    ids.map(id => App.characters.find(item => item.id === id)?.category), ids
  );
  expect(categories.every(category => category === 'female')).toBe(true);
});


test('explore keeps favorites and recently viewed works on this device', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('yorubay:explore-continuity:v1'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => App.showView('explore'));

  const target = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(target).toBeVisible();

  const favorite = target.locator('[data-explore-favorite]');
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(target.locator('.explore-card-continuity')).toContainText('已收藏');

  const tools = page.locator('#explore-discovery-tools');
  await tools.getByRole('button', { name: '★ 收藏', exact: true }).click();
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBe(1);
  await expect(target).toBeVisible();

  await target.click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await page.evaluate(() => App.showView('explore'));
  await expect(page.locator('#explore-view')).toHaveClass(/active/);

  await tools.getByRole('button', { name: '最近看過', exact: true }).click();
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBe(1);
  await expect(target).toBeVisible();
  await expect(target.locator('.explore-card-continuity')).toContainText('最近看過');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yorubay:explore-continuity:v1') || '{}'));
  expect(saved.favorites).toContain('night-sky-magic-academy');
  expect(saved.recent[0].id).toBe('night-sky-magic-academy');

  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
});


test('explore surfaces NEW and UPDATED from explicit catalog timestamps', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('yorubay:explore-continuity:v1'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => App.showView('explore'));

  const tools = page.locator('#explore-discovery-tools');
  const target = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(target).toBeVisible();
  await expect(target.locator('.explore-update-badge')).toHaveText('NEW');

  await tools.getByRole('button', { name: '最近更新', exact: true }).click();
  await expect(target).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('目前顯示');

  await target.click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await page.evaluate(() => App.showView('explore'));
  await expect(target.locator('.explore-update-badge')).toHaveCount(0);

  await page.evaluate(() => {
    const item = App.characterManifest.find(entry => entry.id === 'night-sky-magic-academy');
    item.updated_at = new Date(Date.now() - 60_000).toISOString();
    BAOExploreDiscovery.apply();
  });
  await expect(target.locator('.explore-update-badge')).toHaveText('UPDATED');

  await page.evaluate(() => BAOExploreDiscovery.markViewed('night-sky-magic-academy', Date.now()));
  await expect(target.locator('.explore-update-badge')).toHaveCount(0);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yorubay:explore-continuity:v1') || '{}'));
  expect(saved.recent[0].seenUpdatedAt).toBeGreaterThan(0);
});

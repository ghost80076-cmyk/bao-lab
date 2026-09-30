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

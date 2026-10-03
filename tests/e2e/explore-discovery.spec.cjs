const { test, expect } = require('@playwright/test');

async function chooseFilter(page, name) {
  const tools = page.locator('#explore-discovery-tools');
  await tools.locator('[data-explore-filter-open]').click();
  const dialog = page.locator('#explore-filter-sheet');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name, exact: true }).click();
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
}


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
  await tools.locator('[data-explore-filter-open]').click();
  const filterDialog = page.locator('#explore-filter-sheet');
  await expect(filterDialog.getByRole('button', { name: '世界模擬', exact: true })).toBeVisible();
  await expect(filterDialog.getByRole('button', { name: '互動 UI', exact: true })).toBeVisible();
  await filterDialog.locator('[data-explore-filter-close]').click();

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

  await chooseFilter(page, '世界模擬');
  await expect(page.locator('#character-list [data-character-id="explore-basic-e2e"]')).toBeHidden();

  await input.fill('純文字測試作品');
  await expect(page.locator('#explore-search-empty')).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('目前顯示 0 個作品');

  await tools.locator('[data-explore-reset]').click();
  await expect(page.locator('#character-list [data-character-id="explore-basic-e2e"]')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    toolsRight: document.getElementById('explore-discovery-tools').getBoundingClientRect().right
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.toolsRight).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('female-oriented filtering follows the work label even when the lead character is male', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.getByRole('button', { name: '作品', exact: true }).click();

  await chooseFilter(page, '女性向');
  await expect(page.locator('#character-list [data-character-id="linchenfeng"]')).toBeVisible();
  await expect(page.locator('#character-list [data-character-id="unhealed-bonds"]')).toBeVisible();

  const visibleIds = await page.locator('#character-list [data-character-id]:visible')
    .evaluateAll(nodes => nodes.map(node => node.dataset.characterId));
  const categories = await page.evaluate(ids =>
    ids.map(id => App.characters.find(item => item.id === id)?.category), visibleIds
  );
  expect(categories.length).toBeGreaterThan(0);
  expect(categories.every(category => category === 'female')).toBe(true);
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
  await expect.poll(() => page.evaluate(() => window.BAOExploreDiscovery?.state?.category)).toBe('female');
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

  const tools = page.locator('#explore-discovery-tools');
  await chooseFilter(page, '★ 收藏');
  await expect(target.locator('.explore-card-context')).toContainText('收藏中');
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBe(1);
  await expect(target).toBeVisible();

  await target.locator('.character-image-wrap').click();
  await expect(page.locator('#explore-work-preview')).toBeVisible();
  await page.locator('#explore-work-preview').getByRole('button', { name: '查看作品', exact: true }).click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await page.evaluate(() => App.showView('explore'));
  await expect(page.locator('#explore-view')).toHaveClass(/active/);

  await chooseFilter(page, '最近看過');
  await expect.poll(() => page.locator('#character-list [data-character-id]:visible').count()).toBe(1);
  await expect(target).toBeVisible();
  await expect(target.locator('.explore-card-context')).toContainText('上次看過');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yorubay:explore-continuity:v1') || '{}'));
  expect(saved.favorites).toContain('night-sky-magic-academy');
  expect(saved.recent[0].id).toBe('night-sky-magic-academy');

  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
});


test('explore surfaces player-relative NEW and UPDATED from explicit published versions', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('yorubay:explore-continuity:v1'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => App.showView('explore'));

  const tools = page.locator('#explore-discovery-tools');
  const target = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(target).toBeVisible();
  await expect(target.locator('.explore-update-badge')).toHaveText('NEW');
  await expect(target.locator('.explore-card-capabilities')).toHaveCount(0);

  await page.waitForFunction(() =>
    [...document.styleSheets].some(sheet => String(sheet.href || '').includes('bao-editorial-cinema.css'))
  );
  const badgeLayout = await target.evaluate(card => {
    const category = card.querySelector('.category-badge')?.getBoundingClientRect();
    const update = card.querySelector('.explore-update-badge')?.getBoundingClientRect();
    return category && update
      ? {
          categoryTop: category.top,
          categoryRight: category.right,
          updateTop: update.top,
          updateLeft: update.left
        }
      : null;
  });
  expect(badgeLayout).not.toBeNull();
  expect(Math.abs(badgeLayout.updateTop - badgeLayout.categoryTop)).toBeLessThanOrEqual(2);
  expect(badgeLayout.updateLeft).toBeGreaterThanOrEqual(badgeLayout.categoryRight + 4);

  await chooseFilter(page, '有近期更新');
  await expect(target).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('目前顯示');

  await target.locator('.character-image-wrap').click();
  await expect(page.locator('#explore-work-preview')).toBeVisible();
  await page.locator('#explore-work-preview').getByRole('button', { name: '查看作品', exact: true }).click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await expect(page.locator('#character-detail .explore-detail-version')).toContainText('公開版本 v1');
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yorubay:explore-continuity:v1') || '{}'));
  expect(saved.recent[0].seenVersion).toBe(1);

  await page.evaluate(() => App.showView('explore'));
  await expect(target.locator('.explore-update-badge')).toHaveCount(0);

  // A catalog-only metadata edit must not look like new story content.
  await page.evaluate(() => {
    const item = App.characterManifest.find(entry => entry.id === 'night-sky-magic-academy');
    item.updated_at = new Date(Date.now() - 30_000).toISOString();
    BAOExploreDiscovery.apply();
  });
  await expect(target.locator('.explore-update-badge')).toHaveCount(0);

  // A player-facing release increments the version and release timestamp.
  await page.evaluate(() => {
    const item = App.characterManifest.find(entry => entry.id === 'night-sky-magic-academy');
    item.published_version = 2;
    item.version_published_at = new Date(Date.now() - 60_000).toISOString();
    item.updated_at = item.version_published_at;
    BAOExploreDiscovery.apply();
  });
  await expect(target.locator('.explore-update-badge')).toHaveText('UPDATED');
  await expect(target.locator('.explore-update-badge')).toHaveAttribute('aria-label', /v2/);

  await chooseFilter(page, '有近期更新');
  await expect(target.locator('.explore-card-context')).toContainText('v2');

  await page.evaluate(() => BAOExploreDiscovery.markViewed('night-sky-magic-academy', Date.now()));
  await expect(target.locator('.explore-update-badge')).toHaveCount(0);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yorubay:explore-continuity:v1') || '{}'));
  expect(saved.recent[0].seenUpdatedAt).toBeGreaterThan(0);
  expect(saved.recent[0].seenVersion).toBe(2);
});


test('explore cards change information emphasis by browsing context', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yorubay:explore-continuity:v1', JSON.stringify({
      favorites: ['night-sky-magic-academy'],
      recent: [{
        id: 'night-sky-magic-academy',
        viewedAt: Date.now() - 60_000,
        seenUpdatedAt: Date.parse('2026-09-29T11:27:09Z'),
        seenVersion: 1
      }]
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => App.showView('explore'));

  const tools = page.locator('#explore-discovery-tools');
  const target = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');

  await chooseFilter(page, '最近看過');
  await expect(target.locator('.explore-card-context')).toContainText('上次看過');
  await expect(target.locator('.character-content > .tags')).toBeHidden();

  await chooseFilter(page, '★ 收藏');
  await expect(target.locator('.explore-card-context')).toContainText('收藏中');

  await chooseFilter(page, '有近期更新');
  await expect(target.locator('.explore-card-context')).toContainText('更新於');
});


test('explore preview stays catalog-only and repeated apply does not reinsert stable cards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => App.showView('explore'));
  await page.waitForTimeout(50);

  const target = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(target).toBeVisible();
  await expect(target.locator('.character-content > p')).toBeHidden();
  await expect(target.locator('.character-content > .tags')).toBeHidden();

  const stable = await page.evaluate(async () => {
    const list = document.getElementById('character-list');
    let childListMutations = 0;
    const observer = new MutationObserver(records => {
      childListMutations += records.filter(record => record.type === 'childList' && record.target === list).length;
    });
    observer.observe(list, { childList: true });

    window.__exploreFullLoads = 0;
    const originalLoadCharacter = App.loadCharacter.bind(App);
    App.loadCharacter = async function(...args) {
      window.__exploreFullLoads += 1;
      return originalLoadCharacter(...args);
    };

    BAOExploreDiscovery.apply();
    BAOExploreDiscovery.apply();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return childListMutations;
  });
  expect(stable).toBe(0);

  await target.locator('.character-image-wrap').click();
  const preview = page.locator('#explore-work-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-explore-preview-description]')).not.toHaveText('');
  await expect.poll(() => page.evaluate(() => window.__exploreFullLoads)).toBe(0);

  await preview.getByRole('button', { name: '查看作品', exact: true }).click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.__exploreFullLoads)).toBe(1);
});

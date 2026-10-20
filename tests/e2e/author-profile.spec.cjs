const { test, expect } = require('@playwright/test');

test('public author page shows works and sends support directly to the author', async ({ page }) => {
  await page.route('**/data/authors.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      schema_version: 1,
      authors: [{
        id: 'baitao',
        name: '白桃',
        bio: '在夜裡寫長篇故事。',
        support_links: [{
          label: '替作者留一盞燈',
          url: 'https://example.com/baitao/support'
        }],
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-10-02T00:00:00Z'
      }]
    })
  }));

  await page.route('**/data/characters.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      {
        id: 'baitao-story',
        file: 'data/characters/general/baitao-story.json',
        name: '白桃的故事',
        title: '白桃的故事',
        avatar: 'assets/bao-bun.svg',
        category: 'female',
        rating: 'general',
        tags: ['長篇故事'],
        description: '作者公開作品測試。',
        author: '白桃',
        author_id: 'baitao',
        published_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        published_version: 2,
        version_published_at: '2026-10-01T00:00:00Z'
      },
      {
        id: 'other-story',
        name: '其他作者',
        title: '其他作者',
        author_id: 'someone-else'
      }
    ])
  }));

  await page.route('**/data/character-catalog/community/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ schema_version: 1, page_size: 48, total: 0, pages: [] })
  }));

  await page.goto('./author.html?id=baitao');

  await expect(page.getByRole('heading', { name: '白桃', exact: true })).toBeVisible();
  await expect(page.locator('.author-profile-id')).toHaveText('@baitao');
  await expect(page.locator('.author-profile-bio')).toContainText('在夜裡寫長篇故事');
  await expect(page.locator('.author-profile-summary')).toContainText('1 部公開作品');

  const support = page.getByRole('link', { name: '替作者留一盞燈', exact: true });
  await expect(support).toHaveAttribute('href', 'https://example.com/baitao/support');
  await expect(support).toHaveAttribute('target', '_blank');
  await expect(page.locator('.author-support-card')).toContainText('夜灣不代收、不轉金流、不抽成');

  const work = page.locator('.author-work-card');
  await expect(work).toHaveCount(1);
  await expect(work).toContainText('白桃的故事');
  await expect(work).toContainText('v2');
  await expect(work.getByRole('link', { name: '白桃的故事', exact: true })).toHaveAttribute('href', './?work=baitao-story');

  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('explore preview links stable author IDs to author pages', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
  await page.evaluate(() => {
    const item = App.characterManifest.find(entry => entry.id === 'night-sky-magic-academy');
    item.author = '白桃';
    item.author_id = 'baitao';
    BAOExploreDiscovery.apply();
    BAOExploreDiscovery.openPreview('night-sky-magic-academy');
  });

  const preview = page.locator('#explore-work-preview');
  await expect(preview).toBeVisible();
  const author = preview.getByRole('link', { name: '作者 · 白桃', exact: true });
  await expect(author).toHaveAttribute('href', 'author?id=baitao');

  await preview.locator('[data-explore-preview-close]').first().click();
  const card = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(card.locator('.explore-author-link')).toHaveCount(0);
  await expect(card).toContainText('夜穹魔法學院');
});

test('author work links deep-link back into the explore preview', async ({ page }) => {
  await page.goto('./?work=night-sky-magic-academy');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery));
  await expect(page.locator('#explore-work-preview')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#explore-work-preview-title')).toContainText('魔法');
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
});

// Fixtures only: no support/payment or model request leaves the test context.
const profileFixture = {
  schema_version: 1,
  authors: [{
    id: 'journey-writer', name: '旅程作者', bio: '作者路徑驗收。',
    support_links: [
      { label: '支持作者 A', url: 'https://example.test/support-a' },
      { label: '支持作者 B', url: 'https://example.test/support-b' },
      { label: '不應顯示的連結', url: 'javascript:alert(1)' }
    ]
  }]
};
const publicWork = {
  id: 'night-sky-magic-academy', file: 'data/characters/general/night-sky-magic-academy.json',
  name: '旅程公開作品', title: '旅程公開作品', avatar: 'assets/bao-bun.svg',
  description: '固定公開目錄驗收。', author: '旅程作者', author_id: 'journey-writer',
  rating: 'general', tags: [], category: 'female', published_version: 2
};
const jsonRoute = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
async function authorRoutes(page) {
  // The production host rewrites /author to author.html; the local static server does not.
  await page.route(url => url.pathname === '/author', route => route.fulfill({ path: require('node:path').join(__dirname, '../../author.html'), contentType: 'text/html' }));
  await page.route('**/data/authors.json', route => jsonRoute(route, profileFixture));
  await page.route('**/data/characters.json', route => jsonRoute(route, [publicWork]));
  await page.route('**/data/character-catalog/community/manifest.json', route => jsonRoute(route, { pages: [] }));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`work to author to direct support and back to public version (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const modelRequests = [];
    page.context().on('request', request => {
      if (/\/chat\/completions|\/v1\/messages|:generateContent|:streamGenerateContent/.test(request.url())) modelRequests.push(request.url());
    });
    // Open the real work preview first; install author-page catalog fixtures only afterwards.
    await page.goto('./?work=night-sky-magic-academy');
    await expect(page.locator('#explore-work-preview')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => {
      const item = App.characterManifest.find(entry => entry.id === 'night-sky-magic-academy');
      item.author = '旅程作者'; item.author_id = 'journey-writer';
      BAOExploreDiscovery.openPreview(item.id);
    });
    await authorRoutes(page);
    await page.context().route('https://example.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Support fixture</h1>' }));
    await page.locator('#explore-work-preview').getByRole('link', { name: '作者 · 旅程作者', exact: true }).click();
    await expect(page).toHaveURL(/\/author\?id=journey-writer$/);
    await expect(page.getByRole('heading', { name: '旅程作者', exact: true })).toBeVisible();
    await expect(page.locator('.author-work-card')).toHaveCount(1);
    await expect(page.locator('.author-work-card')).toContainText('v2');
    await expect(page.locator('.author-support-actions a')).toHaveCount(2);
    await expect(page.getByText('不應顯示的連結', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`author-journey-${viewport.width}.png`) });
    for (const [label, target] of [['支持作者 A', 'support-a'], ['支持作者 B', 'support-b']]) {
      const link = page.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveAttribute('href', `https://example.test/${target}`);
      await expect(link).toHaveAttribute('rel', /noopener/);
      const popupPromise = page.waitForEvent('popup');
      await link.click(); const popup = await popupPromise;
      await expect(popup).toHaveURL(`https://example.test/${target}`);
      await expect(popup.getByRole('heading', { name: 'Support fixture' })).toBeVisible();
      await popup.close();
    }
    await page.locator('.author-work-card').getByRole('link', { name: '旅程公開作品', exact: true }).click();
    await expect(page.locator('#explore-work-preview')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#explore-work-preview-title')).toContainText('旅程公開作品');
    expect(modelRequests).toEqual([]);
  });
}

test('author registry failure is retryable and never reports a missing author', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authorRoutes(page);
  let attempts = 0;
  await page.route('**/data/authors.json', route => ++attempts === 1
    ? route.fulfill({ status: 503, body: 'PRIVATE_FAILURE_BODY' }) : jsonRoute(route, profileFixture));
  await page.goto('./author.html?id=journey-writer');
  await expect(page.getByRole('heading', { name: '作者資料暫時無法載入' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('找不到這位作者');
  await expect(page.locator('main')).not.toContainText('PRIVATE_FAILURE_BODY');
  await page.getByRole('button', { name: '重新載入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '旅程作者', exact: true })).toBeVisible();
  await expect(page.locator('.author-profile-summary')).toHaveText('1 部公開作品');
  expect(attempts).toBe(2);
});

test('partial community catalog preserves loaded works and recovers on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authorRoutes(page);
  await page.route('**/data/character-catalog/community/manifest.json', route => jsonRoute(route, { pages: [{ file: 'data/test-author-page.json' }] }));
  let attempts = 0;
  await page.route('**/data/test-author-page.json', route => ++attempts === 1
    ? route.abort() : jsonRoute(route, [{ ...publicWork, id: 'second-public-work', title: '恢復載入的作品', published_version: 3 }]));
  await page.goto('./author.html?id=journey-writer');
  await expect(page.getByRole('status')).toContainText('清單可能不完整');
  await expect(page.locator('.author-profile-summary')).toHaveText('已載入 1 部公開作品');
  await expect(page.locator('.author-work-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '支持作者 A', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('目前還沒有公開作品');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('author-partial-catalog-mobile.png') });
  await page.getByRole('button', { name: '重新載入作品' }).click();
  await expect(page.locator('.author-profile-summary')).toHaveText('2 部公開作品');
  await expect(page.locator('.author-work-card')).toHaveCount(2);
  await expect(page.locator('.author-work-card').filter({ hasText: '恢復載入的作品' })).toContainText('v3');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('successful empty author and work metadata keep genuine missing and empty states', async ({ page }) => {
  await authorRoutes(page);
  await page.route('**/data/characters.json', route => jsonRoute(route, []));
  await page.goto('./author.html?id=journey-writer');
  await expect(page.locator('.author-profile-summary')).toHaveText('0 部公開作品');
  await expect(page.locator('main')).toContainText('目前還沒有公開作品');
  await expect(page.getByRole('button', { name: /重新載入/ })).toHaveCount(0);
  await page.goto('./author.html?id=not-registered');
  await expect(page.getByRole('heading', { name: '找不到這位作者' })).toBeVisible();
  await expect(page.getByRole('button', { name: /重新載入/ })).toHaveCount(0);
});

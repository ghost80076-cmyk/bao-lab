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
  await expect(author).toHaveAttribute('href', 'author.html?id=baitao');

  await preview.locator('[data-explore-preview-close]').first().click();
  const card = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
  await expect(card.locator('.explore-author-link')).toHaveAttribute('href', 'author.html?id=baitao');
});

test('author work links deep-link back into the explore preview', async ({ page }) => {
  await page.goto('./?work=night-sky-magic-academy');
  await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery));
  await expect(page.locator('#explore-work-preview')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#explore-work-preview-title')).toContainText('魔法');
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
});

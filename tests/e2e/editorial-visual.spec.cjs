const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const capture = async (page, name) => {
  fs.mkdirSync('test-results/editorial', { recursive: true });
  await page.screenshot({ path: `test-results/editorial/${name}.png`, fullPage: true, animations: 'disabled' });
};

for (const width of [390, 1280]) {
  test(`editorial home, gallery disclosure and character detail work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.App?.characters?.length &&
      document.querySelector('#home-view .brand-hero') && window.BAOGalleryFocus));
    await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
    await expect(page.locator('#home-view #bao-home-portrait')).toBeVisible();
    await expect(page.locator('link[href="css/bao-editorial-polish.css?v=1"]')).toHaveCount(1);
    await expect(page.locator('link[href="css/bao-editorial-cinema.css?v=1"]')).toHaveCount(1);
    await expect.poll(() => page.locator('#home-view .brand-hero h1').evaluate(node => getComputedStyle(node).whiteSpace)).toBe('normal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await capture(page, `home-${width}`);
    await page.locator('#home-view button[data-view="explore"]').click();
    const card = page.locator('#character-list .character-card').first();
    await expect(card).toBeVisible();
    const more = page.locator('#explore-view .bao-gallery-more');
    await expect(more).toBeVisible();
    await expect(more).not.toHaveAttribute('open', '');
    await expect(page.locator('#explore-view .character-tools > a[href="character-studio.html"]')).toBeVisible();
    await expect(page.locator('#explore-view .character-tools > a[download]')).toHaveCount(2);
    await expect(page.locator('#import-character-button')).toBeHidden();
    const image = card.locator('.character-image-wrap img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => getComputedStyle(node).aspectRatio)).toBe('2 / 3');
    const imageBox = await image.boundingBox();
    expect(imageBox.height / imageBox.width).toBeGreaterThan(1.4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await capture(page, `characters-${width}`);
    await more.locator('summary').click();
    await expect(page.locator('#import-character-button')).toBeVisible();
    await page.locator('#manage-character-button').click();
    await expect(page.locator('#custom-character-list')).toContainText('目前沒有本機匯入角色');
    await more.locator('summary').click();
    await card.click();
    await expect(page.locator('#detail-view .detail-theme-shell')).toBeVisible();
    await expect(page.locator('#detail-start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await capture(page, `character-detail-${width}`);
  });

  test(`bookshelf covers and the existing continue action work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.locator('#home-view button[data-view="explore"]').click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
    await page.locator('#bao-demo-mode').check();
    await page.locator('#next-step').click();
    await page.locator('#start-story').click();
    await expect(page.locator('#user-input')).toBeVisible();
    await page.evaluate(async () => { App.saveStory(false); await BAOStoryLibrary.flush(); });
    await page.evaluate(() => BAOStoryTools.openLibrary());
    const shelf = page.locator('.story-library-story.bao-shelf-enhanced');
    await expect(shelf).toBeVisible();
    await expect(shelf.locator('.bao-shelf-cover')).toBeVisible();
    await expect(shelf.locator('.story-library-chapter')).toHaveCount(1);
    await expect.poll(() => shelf.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('0px');
    await expect(shelf.getByRole('button', { name: '繼續此故事' })).toBeVisible();
    await capture(page, `bookshelf-${width}`);
    await shelf.getByRole('button', { name: '繼續此故事' }).click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    await expect(page.locator('#user-input')).toBeVisible();
  });
}

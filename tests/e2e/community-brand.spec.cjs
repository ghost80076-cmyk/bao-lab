const { test, expect } = require('@playwright/test');

const INVITE = 'https://discord.gg/N3XpAhwTN';

test.describe('BAO/LAB official identity and concise community entry', () => {
  test('Cinematic Night homepage keeps the character first and mascot subtle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home-view .brand-hero h1')).toContainText('今晚，想走進');
    await expect(page.locator('#home-feature-stage')).toBeVisible();
    await expect(page.locator('#home-view')).not.toContainText('SYSTEM READY');
    await expect(page.locator('#home-view .brand-reading-intro')).toBeVisible();
    await expect(page.locator('#home-view .brand-paper-page')).toContainText('閱讀示例');
    await expect(page.locator('#home-library')).toContainText('故事先保存在目前裝置');
    await expect(page.locator('#home-closing')).toBeVisible();
    await expect(page.locator('#home-view .brand-chapter-grid')).toHaveCount(0);
    const portrait = page.locator('#bao-home-portrait img:not(.bao-portrait-bun)');
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#bao-discord-nav')).toHaveCount(0);
    await expect(page.locator('#bao-contact-nav')).toHaveCount(0);
    await expect(page.locator('#home-view .brand-contact')).toHaveCount(0);
    await expect(page.locator('#home-view .brand-feature-grid')).toHaveCount(0);
    await expect(page.locator('#bao-contact-footer a')).toHaveAttribute('href', INVITE);
    await page.getByRole('button', { name: '關於 BAO/LAB' }).click();
    await expect(page.locator('#about-view.active')).toContainText('讓故事回到玩家手中');
    await expect(page.locator('#about-view.active')).toContainText('角色 · 世界 · 互動 · 自己的 AI');
  });

  test('mobile navigation and mascot hero fit without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#bao-home-portrait')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, navScroll: document.querySelector('.topbar nav').scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.navScroll).toBeGreaterThanOrEqual(0);
  });
});

for (const width of [320, 390, 1280]) {
  test(`home reading page and continuation actions work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.BAOStoryTools && window.BAOGoogleDriveSync));
    const works = page.locator('#home-view .home-character-card');
    await expect(works.first()).toBeVisible();
    expect(await works.count()).toBeLessThanOrEqual(4);
    const paper = page.locator('#home-reading .brand-paper-page');
    await paper.scrollIntoViewIfNeeded();
    await expect(paper).toBeVisible();
    const layout = await paper.evaluate(node => {
      const prose = getComputedStyle(node.querySelector('.brand-paper-prose'));
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, lineHeight: parseFloat(prose.lineHeight) / parseFloat(prose.fontSize), pageWidth: document.documentElement.scrollWidth };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width + 1);
    expect(layout.pageWidth).toBeLessThanOrEqual(width + 1);
    expect(layout.lineHeight).toBeGreaterThanOrEqual(1.8);
    await page.locator('#home-library-open').click();
    await expect(page.locator('.story-library-shell')).toBeVisible();
    await page.locator('.story-tools-main [data-back]').click();
    await expect(page.locator('.story-tools-backdrop')).toHaveCount(0);
    await page.locator('#home-sync-open').click();
    const sync = page.locator('#bao-drive-panel');
    await expect(sync).toBeVisible();
    await sync.getByRole('button', { name: '關閉', exact: true }).click();
    await expect(sync).toBeHidden();
    await page.locator('#home-start-story').click();
    await expect(page.locator('#explore-view.active .character-card').first()).toBeVisible();
  });
}

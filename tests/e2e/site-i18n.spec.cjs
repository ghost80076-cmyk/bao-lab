const { test, expect } = require('@playwright/test');

// Exercise the full page: DOM mocks cannot detect competing MutationObservers.
async function disturbSidebar(page) {
  await page.evaluate(() => {
    const node = document.createElement('span');
    document.querySelector('#chat-view .chat-layout > aside').append(node);
    node.remove();
  });
  // A timer and a real click must both run after observer microtasks have settled.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`three interface locales remain responsive with background story tools (${viewport.width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await page.waitForFunction(() => window.BAOChatControlsClarity && window.App?.characters?.length);
    const originalStoryLanguage = await page.evaluate(() => window.BAOPlayerSettings.getLanguage());
    const marker = await page.evaluate(() => {
      const node = document.createElement('p');
      node.dataset.i18nSkip = '';
      node.id = 'locale-player-fixture';
      node.textContent = '首頁：玩家的故事與角色';
      document.querySelector('#home-view').append(node);
      return node.textContent;
    });
    for (const [locale, label] of [['zh-Hans', '模型连接'], ['en', 'Model connection'], ['zh-Hant', '模型連線']]) {
      await page.locator('[data-ui-locale-select]').selectOption(locale);
      await disturbSidebar(page);
      await expect(page.locator('#bao-chat-api-aside')).toHaveText(label);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#locale-player-fixture')).toHaveText(marker);
      const explore = page.locator(viewport.width < 500 ? '#home-view [data-view="explore"]' : '.topbar nav [data-view="explore"]');
      await explore.click();
      await expect(page.locator('#explore-view')).toHaveClass(/active/);
      await page.locator(viewport.width < 500 ? '[data-player-nav="home"]' : '.topbar nav [data-view="home"]').click();
      await expect(page.locator('#home-view')).toHaveClass(/active/);
      expect(await page.evaluate(() => window.BAOPlayerSettings.getLanguage())).toBe(originalStoryLanguage);
    }
    // Persisting a non-default language must not freeze the next page load.
    await page.locator('[data-ui-locale-select]').selectOption('zh-Hans');
    await page.reload();
    await page.waitForFunction(() => window.BAOChatControlsClarity && window.App?.characters?.length);
    await disturbSidebar(page);
    await expect(page.locator('[data-ui-locale-select]')).toHaveValue('zh-Hans');
    await expect(page.locator('#bao-chat-api-aside')).toHaveText('模型连接');
    await page.locator(viewport.width < 500 ? '#home-view [data-view="explore"]' : '.topbar nav [data-view="explore"]').click();
    await expect(page.locator('#explore-view')).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });
}

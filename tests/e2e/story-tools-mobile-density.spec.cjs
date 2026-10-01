const { test, expect } = require('@playwright/test');

test('mobile story desk and library keep actions ahead of long explanations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOStoryTools &&
    window.BAOStoryLibrary &&
    App.characters?.length &&
    Storage.status().ready
  ));

  await page.evaluate(async () => {
    App.activeCharacter = {
      ...App.characters[0],
      greeting: '港口的燈還亮著。'
    };
    App.config = {
      persona: { name: '旅人', identity: '記者', relationship: '舊識' },
      narrativeMode: 'world',
      displayMode: 'ui',
      api: { model: 'mock-story-desk', baseUrl: 'https://example.invalid', key: 'EPHEMERAL_TEST_KEY' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    App.saveStory(false);
    await BAOStoryLibrary.flush();
  });

  await page.evaluate(() => BAOStoryTools.open());
  let dialog = page.getByRole('dialog', { name: '故事管理' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.story-tools-home-head .eyebrow')).toBeHidden();

  const help = dialog.getByRole('button', { name: '故事管理說明' });
  await expect(help).toBeVisible();
  await expect(dialog.locator('.story-tools-home-head .story-tools-help-copy')).toBeHidden();
  await expect(dialog.locator('.story-tools-home .story-tools-card').first().locator(':scope > p')).toBeHidden();

  const deskLayout = await dialog.evaluate(node => ({
    columns: getComputedStyle(node.querySelector('.story-tools-home')).gridTemplateColumns.trim().split(/\s+/).length,
    backdropAlign: getComputedStyle(node.parentElement).alignItems,
    bottomRadius: getComputedStyle(node).borderBottomLeftRadius
  }));
  expect(deskLayout).toEqual({ columns: 2, backdropAlign: 'flex-end', bottomRadius: '0px' });

  await help.click();
  await expect(dialog.locator('.story-tools-home-head .story-tools-help-copy')).toBeVisible();
  await expect(dialog.locator('.story-tools-home .story-tools-card').first().locator(':scope > p')).toBeVisible();
  await help.click();

  await dialog.getByRole('button', { name: '回到我的故事' }).click();
  dialog = page.getByRole('dialog', { name: '我的故事' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.story-library-head .eyebrow')).toBeHidden();

  const libraryHelp = dialog.getByRole('button', { name: '我的故事說明' });
  await expect(libraryHelp).toBeVisible();
  await expect(dialog.locator('.story-library-help-copy')).toBeHidden();
  await expect(dialog.getByRole('button', { name: '匯入完整故事' })).toBeVisible();

  const libraryLayout = await dialog.evaluate(node => ({
    backdropAlign: getComputedStyle(node.parentElement).alignItems,
    bottomRadius: getComputedStyle(node).borderBottomLeftRadius,
    searchHeight: Math.round(node.querySelector('[data-story-library-search]')?.getBoundingClientRect().height || 0)
  }));
  expect(libraryLayout.backdropAlign).toBe('flex-end');
  expect(libraryLayout.bottomRadius).toBe('0px');
  expect(libraryLayout.searchHeight).toBeGreaterThan(0);

  await libraryHelp.click();
  await expect(dialog.locator('.story-library-help-copy')).toBeVisible();
  await libraryHelp.click();
  await expect(dialog.locator('.story-library-help-copy')).toBeHidden();

  await expect(dialog.locator('[data-story-library-card]')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: '繼續' })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

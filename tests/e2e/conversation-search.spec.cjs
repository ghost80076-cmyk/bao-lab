const { test, expect } = require('@playwright/test');

test('searches the current local story and jumps to the selected message', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOConversationSearch && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '歡迎回到夜灣。' };
    App.config = {
      persona: { name: '玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' },
      narrativeMode: 'immersive', displayMode: 'text',
      api: { model: 'mock', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'rounds', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    const greeting = Chat.add('assistant', App.activeCharacter.greeting); greeting.greeting = true;
    const oldPort = Chat.add('user', '我在雨夜走進港口。');
    oldPort.createdAt = new Date(Date.now() - 10 * 86400000).toISOString();
    Chat.add('assistant', '他撐著傘，在港口等你。');
    Chat.add('user', '我問起那封信。');
    Chat.add('assistant', '他把那封信放在桌上。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  await expect(page.getByRole('button', { name: '⌕ 搜尋對話' })).toBeVisible();
  await page.getByRole('button', { name: '⌕ 搜尋對話' }).click();
  const dialog = page.getByRole('dialog', { name: '搜尋這個對話' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('港口');
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 2 則');
  await expect(dialog.locator('.conversation-search-result')).toHaveCount(2);
  await dialog.getByRole('button', { name: '近 7 天' }).click();
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 1 則');
  await expect(dialog.locator('.conversation-search-result-meta')).toContainText('AI');
  await dialog.getByRole('button', { name: '全部日期' }).click();
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 2 則');
  await dialog.getByRole('button', { name: '只看 AI' }).click();
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 1 則');
  await dialog.locator('.conversation-search-result').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#chat-stream > .message[data-message-index="2"]')).toHaveClass(/bao-search-target/);
});

test('searches every chapter and safely switches to an older result', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOConversationSearch && window.BAOStoryLibrary && App.characters?.length));
  const refs = await page.evaluate(async () => {
    App.activeCharacter = { ...App.characters[0], greeting: '故事開場。' };
    App.config = {
      persona: { name: '玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' },
      narrativeMode: 'immersive', displayMode: 'text', demoMode: true,
      api: { protocol: 'openai', model: 'mock', baseUrl: 'https://example.invalid', key: '' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'rounds', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    BAOStoryLibrary.beginStory('序章');
    Chat.reset();
    Chat.add('user', '我在港口聽見舊鐘。');
    Chat.add('assistant', '潮聲蓋過了回音。');
    Storage.saveStory();
    await BAOStoryLibrary.flush();
    const first = { ...BAOStoryLibrary.refs() };

    BAOStoryLibrary.beginChapter('第二章');
    App.config.api = { protocol: 'openai', model: 'mock-two', baseUrl: 'https://other.invalid', key: 'SECOND-CHAPTER-SECRET' };
    GameState.current.config = App.config;
    Chat.reset();
    Chat.add('user', '我回到港口點亮新燈。');
    Chat.add('assistant', '遠處有人揮手。');
    Storage.saveStory();
    await BAOStoryLibrary.flush();
    const second = { ...BAOStoryLibrary.refs() };
    App.renderChatShell(false);
    App.showView('chat');
    return { first, second };
  });

  await page.getByRole('button', { name: '⌕ 搜尋對話' }).click();
  const dialog = page.getByRole('dialog', { name: '搜尋這個對話' });
  await expect(dialog).toBeVisible();
  const chapterSelect = dialog.getByLabel('章節');
  await expect(chapterSelect).toBeVisible();
  await expect(chapterSelect.locator('option')).toHaveCount(3);
  await dialog.getByRole('searchbox').fill('港口');
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 2 則');
  await expect(dialog.locator('.conversation-search-result-meta')).toHaveText([/序章/, /第二章/]);

  await chapterSelect.selectOption(refs.first.chapterId);
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 1 則');
  await dialog.locator('.conversation-search-result').click();
  await expect(dialog).not.toBeVisible();
  await page.waitForFunction(chapterId => BAOStoryLibrary.refs().chapterId === chapterId, refs.first.chapterId);
  await expect(page.locator('#chat-stream > .message[data-message-index="0"]')).toHaveClass(/bao-search-target/);
  await expect(page.locator('#chat-stream')).toContainText('舊鐘');
  expect(await page.evaluate(() => App.config.api.key)).toBe('');
  expect(refs.second.chapterId).not.toBe(refs.first.chapterId);
});

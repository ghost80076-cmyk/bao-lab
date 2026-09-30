const { test, expect } = require('@playwright/test');

test('opens the current story control center and routes to existing story tools', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOStoryControlCenter &&
    window.BAOStoryExtensionsCenter &&
    window.BAOConversationSearch &&
    window.BAOWorldModules &&
    window.BAOPlayerTextReplace &&
    window.BAORegex &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      greeting: '夜灣的燈還亮著。',
      world_modules: [
        { id: 'inventory', label: '作品背包', context: 'core', tracking: 'high', kind: 'collection' }
      ]
    };
    App.config = {
      persona: { name: '玩家', identity: '旅人', relationship: '初次見面' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: { model: 'mock-story-model', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    BAOWorldModules.applyCustomization({
      version: 1,
      enabledBuiltIns: ['quests'],
      disabled: ['quests'],
      customModules: [{
        id: 'custom_map',
        label: '玩家地圖',
        icon: '◇',
        context: 'ui_only',
        tracking: 'manual',
        kind: 'object',
        triggers: [],
        fields: []
      }],
      order: ['inventory', 'quests', 'custom_map']
    }, App.activeCharacter);
    BAOPlayerTextReplace.set({
      active: true,
      scope: { chat: true, status: false },
      rules: [{ id: 'age', find: '20歲', replace: 'XX歲', enabled: true }]
    });
    BAORegex.save({
      active: true,
      rules: [{ name: '稱呼修正', pattern: '先生', replacement: '老師', flags: 'g', enabled: true }]
    });
    localStorage.setItem(
      'bao-lab:author-regex:v1:' + encodeURIComponent(App.activeCharacter.id),
      JSON.stringify({
        enabled: false,
        allowScripts: false,
        allowExternalAssets: false,
        allowStateSharing: false,
        allowUiPersistence: false,
        rules: [{ pattern: 'hello', replacement: '<b>hi</b>', flags: 'g', enabled: true }]
      })
    );
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.add('user', '我回到港口。');
    Chat.add('assistant', '故事從昨晚停下的地方繼續。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  const open = page.getByRole('button', { name: '故事控制台', exact: true });
  await expect(open).toBeVisible();
  await open.click();

  const dialog = page.getByRole('dialog', { name: '本故事控制台' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('mock-story-model');
  await expect(dialog).toContainText('玩家');
  await expect(dialog).toContainText('故事記憶');
  await expect(dialog).toContainText('人物／世界狀態');
  await expect(dialog).toContainText('故事擴充');
  await expect(dialog).toContainText('敘事與描寫');

  await dialog.getByRole('button', { name: /故事擴充/ }).click();
  await expect(dialog).not.toBeVisible();

  const extensions = page.getByRole('dialog', { name: '故事擴充' });
  await expect(extensions).toBeVisible();
  await expect(extensions).toContainText('世界運作');
  await expect(extensions).toContainText('閱讀排版');
  await expect(extensions).toContainText('玩家顯示 MOD');
  await expect(extensions).toContainText('進階顯示規則');
  await expect(extensions).toContainText('AI 上下文');
  await expect(extensions).toContainText('只改畫面');
  await expect(extensions).toContainText('來源');
  await expect(extensions).toContainText('保存');
  await expect(extensions).toContainText('適用');
  await expect(extensions).toContainText('目前故事');
  await expect(extensions).toContainText('這台裝置的所有故事');
  await expect(extensions).toContainText('玩家規則：所有故事 · 作品規則：目前作品');
  await expect(extensions).toContainText('啟用');
  await expect(extensions).toContainText('作品提供');
  await expect(extensions).toContainText('夜灣內建');
  await expect(extensions).toContainText('玩家建立');
  await expect(extensions).toContainText('作品規則：等待玩家啟用');
  await expect(extensions).toContainText('作者腳本：未允許');
  await expect(extensions).toContainText('不自動送 API');

  const worldCard = extensions.locator('[data-extension-card="world"]');
  await worldCard.locator('summary').click();
  await expect(worldCard.locator('[data-extension-source-group="work"]')).toContainText('作品背包');
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('任務');
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('已停用');
  await expect(worldCard.locator('[data-extension-source-group="player"]')).toContainText('玩家地圖');

  const replaceCard = extensions.locator('[data-extension-card="replace"]');
  await replaceCard.locator('summary').click();
  await expect(replaceCard).toContainText('20歲');
  await expect(replaceCard).toContainText('→ XX歲');
  await expect(replaceCard).toContainText('啟用');

  const regexCard = extensions.locator('[data-extension-card="regex"]');
  await regexCard.locator('summary').click();
  await expect(regexCard.locator('[data-extension-source-group="player"]')).toContainText('稱呼修正');
  await expect(regexCard.locator('[data-extension-source-group="work"]')).toContainText('hello');
  await expect(regexCard.locator('[data-extension-source-group="work"]')).toContainText('等待玩家啟用');

  const sceneCard = extensions.locator('[data-extension-card="scene"]');
  await sceneCard.locator('summary').click();
  await expect(sceneCard).toContainText('閱讀模式');
  await expect(sceneCard).toContainText('狀態顯示');
  await expect(sceneCard.locator('[data-extension-quick]')).toHaveCount(0);

  // Safe quick management: configured world modules can be enabled/disabled here.
  const questRow = worldCard.locator('[data-extension-source-group="platform"] .story-extension-item').filter({ hasText: '任務' });
  await questRow.getByRole('button', { name: '啟用', exact: true }).click();
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('啟用');
  expect(await page.evaluate(() => GameState.current.worldModuleCustomization.disabled.includes('quests'))).toBe(false);

  // Player text MOD master switch can be changed without opening the full editor.
  await replaceCard.locator('summary').click();
  let replaceGroup = replaceCard.locator('[data-extension-source-group="player"]');
  await replaceGroup.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAOPlayerTextReplace.get().active)).toBe(false);
  await expect(replaceCard).toContainText('MOD 關閉');
  replaceGroup = replaceCard.locator('[data-extension-source-group="player"]');
  await replaceGroup.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAOPlayerTextReplace.get().active)).toBe(true);

  // Global player Regex can be switched quickly; authored work rules never get a quick permission button.
  await regexCard.locator('summary').click();
  let regexPlayer = regexCard.locator('[data-extension-source-group="player"]');
  await regexPlayer.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAORegex.load().active)).toBe(false);
  await expect(regexCard).toContainText('總開關關閉');
  regexPlayer = regexCard.locator('[data-extension-source-group="player"]');
  await regexPlayer.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAORegex.load().active)).toBe(true);
  await expect(regexCard.locator('[data-extension-source-group="work"] [data-extension-quick]')).toHaveCount(0);

  await extensions.getByRole('button', { name: '關閉故事擴充' }).click();

  await open.click();
  const reopened = page.getByRole('dialog', { name: '本故事控制台' });
  await reopened.getByRole('button', { name: /搜尋這個故事/ }).click();
  await expect(reopened).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '搜尋這個對話' })).toBeVisible();
});

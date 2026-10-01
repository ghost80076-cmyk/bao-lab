const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

test('exports only portable player settings and imports selected categories after review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOStoryControlCenter &&
    window.BAOStoryExtensionsCenter &&
    window.BAOStoryExtensionPack &&
    window.BAOStoryExtensionPackCore &&
    window.BAOWorldModules &&
    window.BAOPlayerTextReplace &&
    window.BAORegex &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      id: 'portable-pack-test',
      name: '不可外洩作品名稱',
      greeting: 'PRIVATE_STORY_GREETING',
      world_modules: [
        { id: 'work_inventory', label: '作品專屬背包', context: 'core', tracking: 'high', kind: 'collection' }
      ]
    };
    App.config = {
      persona: { name: '玩家', identity: '旅人', relationship: '測試' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: {
        model: 'mock-story-model',
        baseUrl: 'https://example.invalid',
        key: 'SUPER_SECRET_API_KEY'
      },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'smart', cache: true }
    };

    GameState.create(App.activeCharacter, App.config);
    BAOWorldModules.applyCustomization({
      version: 1,
      enabledBuiltIns: ['inventory'],
      disabled: ['work_inventory', 'inventory'],
      customModules: [{
        id: 'custom_notes',
        label: '玩家筆記',
        icon: '◇',
        context: 'ui_only',
        tracking: 'manual',
        kind: 'object',
        triggers: ['筆記'],
        fields: [{ key: 'topic', label: '主題', type: 'text' }]
      }],
      order: ['work_inventory', 'inventory', 'custom_notes']
    }, App.activeCharacter);

    BAOPlayerTextReplace.set({
      active: true,
      scope: { chat: true, status: false },
      rules: [{ id: 'old-replace', find: '舊文字', replace: '舊顯示', enabled: true }]
    });

    BAORegex.save({
      active: true,
      rules: [{ name: '舊 Regex', pattern: '舊', replacement: 'OLD', flags: 'g', enabled: true }]
    });

    localStorage.setItem(
      'bao-lab:author-regex:v1:' + encodeURIComponent(App.activeCharacter.id),
      JSON.stringify({
        enabled: true,
        allowScripts: true,
        allowExternalAssets: true,
        allowStateSharing: true,
        allowUiPersistence: true,
        rules: [{ pattern: 'AUTHOR_PRIVATE_PATTERN', replacement: '<button>secret</button>', flags: 'g', enabled: true }]
      })
    );

    Chat.reset();
    Chat.add('assistant', 'PRIVATE_STORY_LINE');
    App.renderChatShell(false);
    App.showView('chat');
  });

  const open = page.getByRole('button', { name: '故事總覽', exact: true });
  await expect(open).toBeVisible();
  await open.click();

  const control = page.getByRole('dialog', { name: '故事總覽' });
  await control.getByRole('button', { name: /故事擴充/ }).click();

  let extensions = page.getByRole('dialog', { name: '故事擴充' });
  await expect(extensions).toBeVisible();
  await expect(extensions.locator('.story-extensions-head .eyebrow')).toBeHidden();
  const extensionHelp = extensions.getByRole('button', { name: '故事擴充說明' });
  await expect(extensionHelp).toBeVisible();
  await expect(extensions.locator('#story-extension-guide')).toBeHidden();
  const extensionLayout = await extensions.evaluate(node => {
    const card = node.querySelector('.story-extension-card');
    const actions = node.querySelector('.story-extension-pack-actions');
    return {
      cardColumns: card ? getComputedStyle(card).gridTemplateColumns.trim().split(/\s+/).length : 0,
      packColumns: actions ? getComputedStyle(actions).gridTemplateColumns.trim().split(/\s+/).length : 0,
      footerNoteHidden: getComputedStyle(node.querySelector('.story-extensions-note > span')).display === 'none'
    };
  });
  expect(extensionLayout).toEqual({ cardColumns: 2, packColumns: 2, footerNoteHidden: true });
  await extensionHelp.click();
  await expect(extensions.locator('#story-extension-guide')).toBeVisible();
  await extensionHelp.click();
  await expect(extensions.locator('#story-extension-guide')).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    extensions.getByRole('button', { name: '匯出擴充設定', exact: true }).click()
  ]);
  const exportedText = await fs.readFile(await download.path(), 'utf8');
  const exported = JSON.parse(exportedText);

  expect(exported.schema).toBe('yorubay-story-extension-pack');
  expect(exported.version).toBe(1);
  expect(exported.sections.world.enabledBuiltIns).toEqual(['inventory']);
  expect(exported.sections.world.disabled).toEqual(['inventory']);
  expect(exported.sections.world.order).toEqual(['inventory', 'custom_notes']);
  expect(exported.sections.world.customModules[0].id).toBe('custom_notes');
  expect(exported.sections.textReplace.rules[0].find).toBe('舊文字');
  expect(exported.sections.regex.rules[0].name).toBe('舊 Regex');

  expect(exportedText).not.toContain('SUPER_SECRET_API_KEY');
  expect(exportedText).not.toContain('PRIVATE_STORY_LINE');
  expect(exportedText).not.toContain('PRIVATE_STORY_GREETING');
  expect(exportedText).not.toContain('不可外洩作品名稱');
  expect(exportedText).not.toContain('work_inventory');
  expect(exportedText).not.toContain('AUTHOR_PRIVATE_PATTERN');
  expect(exportedText).not.toContain('allowScripts');

  const importedPack = {
    schema: 'yorubay-story-extension-pack',
    version: 1,
    exportedAt: '2026-09-30T10:00:00Z',
    sections: {
      world: {
        enabledBuiltIns: ['quests'],
        disabled: [],
        customModules: [{
          id: 'custom_journal',
          label: '旅行日誌',
          icon: '✦',
          description: '玩家自己的可攜模組',
          context: 'relevant',
          tracking: 'low',
          kind: 'collection',
          triggers: ['日誌'],
          fields: []
        }],
        order: ['quests', 'custom_journal'],
        modules: { shouldNotImport: true }
      },
      textReplace: {
        active: true,
        scope: { chat: true, status: true },
        rules: [{ id: 'new-replace', find: '二十歲', replace: '年齡保密', enabled: true }],
        messages: ['do not import']
      },
      regex: {
        active: false,
        rules: [{ name: '新 Regex', pattern: '老師', replacement: '前輩', flags: 'g', enabled: true }]
      }
    },
    api: { key: 'MALICIOUS_KEY' },
    messages: ['MALICIOUS_STORY'],
    authorRegex: { allowScripts: true }
  };

  await extensions.locator('[data-extension-pack-file]').setInputFiles({
    name: 'portable-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedPack), 'utf8')
  });

  const preview = extensions.locator('.story-extension-pack-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('世界模組設定');
  await expect(preview).toContainText('文字替換 MOD');
  await expect(preview).toContainText('玩家 Regex');
  await expect(preview).toContainText('API Key');
  await expect(preview).toContainText('作品 Regex');
  await expect(preview).toContainText('作者腳本與授權');

  // Keep the device-wide Regex untouched in this pass.
  await preview.locator('[data-extension-pack-section="regex"]').uncheck();
  page.once('dialog', dialog => dialog.accept());
  await preview.getByRole('button', { name: '套用選取設定', exact: true }).click();

  extensions = page.getByRole('dialog', { name: '故事擴充' });
  await expect(extensions).toBeVisible();

  const result = await page.evaluate(() => ({
    world: BAOWorldModules.getCustomization(App.activeCharacter),
    replace: BAOPlayerTextReplace.get(),
    regex: BAORegex.load(),
    authorRegex: JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:' + encodeURIComponent(App.activeCharacter.id)) || 'null'),
    apiKey: App.config.api.key,
    messages: Chat.messages.map(item => item.content)
  }));

  expect(result.world.enabledBuiltIns).toEqual(['quests']);
  expect(result.world.disabled).toContain('work_inventory');
  expect(result.world.disabled).not.toContain('quests');
  expect(result.world.customModules.map(item => item.id)).toEqual(['custom_journal']);
  expect(result.replace.active).toBe(true);
  expect(result.replace.scope).toEqual({ chat: true, status: true });
  expect(result.replace.rules.map(item => item.id)).toEqual(['new-replace']);

  // Regex was explicitly unchecked, so the old device-wide rules remain.
  expect(result.regex.active).toBe(true);
  expect(result.regex.rules[0].name).toBe('舊 Regex');

  // Import never touches author permissions, API credentials, or story messages.
  expect(result.authorRegex.allowScripts).toBe(true);
  expect(result.authorRegex.rules[0].pattern).toBe('AUTHOR_PRIVATE_PATTERN');
  expect(result.apiKey).toBe('SUPER_SECRET_API_KEY');
  expect(result.messages).toContain('PRIVATE_STORY_LINE');
});

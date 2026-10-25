const { test, expect } = require('@playwright/test');

// Offline recovery checks against the actual browser storage and story UI.
// No paid-provider requests: attempts are recorded and must stay empty.
const ready = page => page.waitForFunction(() => Boolean(
  window.BAOStoryReader && window.BAOStoryControlCenter && window.BAOSettingsEffects &&
  window.BAORequestLedger && window.BAOStoryBackup &&
  Storage.status().ready && App.characters?.length
), null, { timeout: 35000 });

const observePosts = page => {
  const posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  return posts;
};

async function seedOfflineStory(page) {
  return page.evaluate(async () => {
    const character = {
      ...App.characters[0], id: 'extension-recovery-fixture',
      name: '載入失敗恢復測試', catalog_only: false,
      system_prompt: 'RECOVERY_SYSTEM_RULE',
      greeting: '測試開場文字'
    };
    App.activeCharacter = character;
    App.config = {
      persona: { name: '測試玩家' },
      narrativeMode: 'immersive', displayMode: 'text', stateTracking: false,
      narrative: { playerPortrayal: 'coauthor', responseLength: 'long',
        customInstructions: [{ text: 'RECOVERY_CUSTOM_RULE', enabled: true }] },
      api: { type: 'custom', protocol: 'openai', model: 'offline-fixture',
        key: 'RECOVERY_DO_NOT_EXPORT', baseUrl: 'https://no-paid-requests.invalid/v1/chat/completions' },
      memory: { mode: 'full', maxRounds: 20, maxContext: 64000 }
    };
    Chat.reset();
    GameState.create(character, App.config);
    Chat.add('user', 'RECOVERY_USER_TURN');
    Chat.add('assistant', 'RECOVERY_ASSISTANT_TURN');
    GameState.current.time = '午夜';
    GameState.current.location = '測試港口';
    GameState.current.contextPack = { summary: 'RECOVERY_CONTEXT_PACK' };
    App.renderChatShell(false);
    App.showView('chat');
    const slot = Storage.saveSlot('RECOVERY_OLD_STORY');
    if (!slot) throw new Error('could not save fixture');
    await Storage.flush();
    return slot;
  });
}

const inspect = page => page.evaluate(() => ({
  title: App.activeCharacter?.name,
  narrative: App.config?.narrative?.playerPortrayal,
  instruction: App.config?.narrative?.customInstructions?.[0]?.text,
  location: GameState.current?.location,
  time: GameState.current?.time,
  summary: GameState.current?.contextPack?.summary,
  messages: Chat.messages.map(m => [m.role, m.content]),
  visible: document.getElementById('chat-view')?.classList.contains('active'),
  apiKey: App.config?.api?.key,
  health: window.BAOExtensionLoadHealth.snapshot(),
  errors: Storage.status().lastRestoreError
}));

async function restoreSlot(page) {
  return page.evaluate(() => {
    const slot = Storage.listSlots().find(s => s.label === 'RECOVERY_OLD_STORY');
    if (!slot || !Storage.restoreStory(slot)) throw new Error('could not restore old story');
    App.renderChatShell(false);
    App.showView('chat');
    return Boolean(window.BAOStoryControlCenter && window.BAOSettingsEffects);
  });
}

const assertStory = value => {
  expect(value.title).toBe('載入失敗恢復測試');
  expect(value.narrative).toBe('coauthor');
  expect(value.instruction).toBe('RECOVERY_CUSTOM_RULE');
  expect(value.location).toBe('測試港口');
  expect(value.time).toBe('午夜');
  expect(value.summary).toBe('RECOVERY_CONTEXT_PACK');
  expect(value.messages).toEqual([['user', 'RECOVERY_USER_TURN'], ['assistant', 'RECOVERY_ASSISTANT_TURN']]);
  expect(value.visible).toBe(true);
  expect(value.apiKey).toBe('');
  expect(value.errors).toBe('');
};

test('optional tool 404 preserves an existing story through reload and file import (390px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const posts = observePosts(page);
  await page.route('**/js/google-drive-config.js*', route =>
    route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* intentional offline tool */' }));
  await page.goto('/');
  await ready(page);
  const backup = await seedOfflineStory(page);
  expect(JSON.stringify(backup)).not.toContain('RECOVERY_DO_NOT_EXPORT');

  await page.reload();
  await ready(page);
  expect(await restoreSlot(page)).toBe(true);
  const restored = await inspect(page);
  assertStory(restored);
  expect(restored.health.optional['google-drive']).toBe('unavailable');
  expect(restored.health.world).toBe('ready');

  // Exercise the real import input, rather than only calling a mock storage parser.
  await page.locator('#import-save-file').setInputFiles({
    name: 'recovery-old-story.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(page.getByText('存檔匯入並確認寫入完成。', { exact: true })).toBeVisible();
  const imported = await page.evaluate(() => {
    const slots = Storage.listSlots().filter(s => s.label === 'RECOVERY_OLD_STORY');
    const selected = slots.at(-1);
    if (!selected || !Storage.restoreStory(selected)) throw new Error('imported story could not restore');
    App.renderChatShell(false);
    App.showView('chat');
    return slots.length;
  });
  expect(imported).toBeGreaterThanOrEqual(2);
  assertStory(await inspect(page));
  expect(posts).toEqual([]);
});

test('world-module 404 never silently marks an old restored story as healthy (1280px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const posts = observePosts(page);
  await page.goto('/');
  await ready(page);
  const backup = await seedOfflineStory(page);
  expect(JSON.stringify(backup)).not.toContain('RECOVERY_DO_NOT_EXPORT');

  await page.route('**/js/world-state.js*', route =>
    route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* missing world dependency */' }));
  await page.reload();
  await ready(page);
  expect(await restoreSlot(page)).toBe(true);
  const restored = await inspect(page);
  assertStory(restored);
  expect(restored.health.world).toBe('unavailable');
  await expect(page.locator('#bao-feedback-toast')).toContainText('世界狀態模組載入不完整');
  expect(posts).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`slow optional script shares the in-flight promise without duplicate Hook installation (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const posts = observePosts(page);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/js/inspiration-copy.js*', async route => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!document.querySelector('script[src="js/inspiration-copy.js"]') &&
        window.BAOExtensionLoadHealth?.snapshot().optional['inspiration-copy'] === undefined,
      null, { timeout: 35000 });
      const pending = await page.evaluate(() => {
        const a = loadBAOScript('js/inspiration-copy.js');
        const b = loadBAOScript('js/inspiration-copy.js');
        return {
          shared: a === b,
          elements: document.querySelectorAll('script[src="js/inspiration-copy.js"]').length,
          copyReady: Boolean(window.BAOInspirationCopy),
          optional: window.BAOExtensionLoadHealth.snapshot().optional['inspiration-copy']
        };
      });
      expect(pending.shared).toBe(true);
      expect(pending.elements).toBe(1);
      expect(pending.copyReady).toBe(false);
      expect(pending.optional).toBeUndefined();
    } finally {
      release();
    }
    await ready(page);
    await page.waitForFunction(() => window.BAOExtensionLoadHealth.snapshot().optional['inspiration-copy'] === 'ready');
    expect(await page.evaluate(() => document.querySelectorAll('script[src="js/inspiration-copy.js"]').length)).toBe(1);
    expect(await page.evaluate(() => window.BAOExtensionLoadHealth.snapshot().world)).toBe('ready');
    expect(posts).toEqual([]);
  });
}

const { test, expect } = require('@playwright/test');


test('core chat shell never exposes authored greeting source even if scene renderer is late', async ({ page }) => {
  await page.route('**/js/scene-html-modes.js*', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    App.characters?.length && window.BAOChatMarkup && Storage.status().ready
  ), null, { timeout: 15000 });
  expect(await page.evaluate(() => Boolean(window.BAOSceneHTML))).toBe(false);

  await page.evaluate(async () => {
    App.activeCharacter = await App.loadCharacter('kurobane-yume-kabukicho');
    App.config = {
      narrativeMode: 'world', displayMode: 'text',
      persona: { name: '玩家', gender: '未指定', identity: '', relationship: '', personality: '', extra: '' },
      api: { model: 'mock-local', baseUrl: 'https://invalid.example/v1', key: 'fake-for-test' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 64000, cache: true }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    const opening = Chat.add('assistant', App.activeCharacter.greeting);
    opening.greeting = true;
    App.renderChatShell(true);
    App.showView('chat');
  });

  const bubble = page.locator('#chat-stream > .message.assistant .bubble').first();
  await expect(bubble.locator('.bao-yume-opening')).toBeVisible();
  await expect(bubble.locator('img')).toHaveAttribute('src', 'assets/yume-yume-rain-v4.webp');
  await expect(bubble).toContainText('Club Rose');
  expect(await bubble.innerText()).not.toContain('<div class=');

  await page.evaluate(() => App.renderChatShell(false));
  await expect(bubble.locator('.bao-yume-opening')).toBeVisible();
  expect(await bubble.innerText()).not.toContain('<div class=');
});

async function prepareYume(page, mode = 'efficient') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    App.characters?.length && window.BAOSceneHTML && window.BAOStoryReader &&
    window.BAOWorldModules && Storage.status().ready
  ), null, { timeout: 20000 });
  await page.evaluate(async selectedMode => {
    App.activeCharacter = await App.loadCharacter('kurobane-yume-kabukicho');
    if (!App.activeCharacter?.greeting?.includes('bao-yume-opening')) throw new Error('Yume source missing');
    App.config = {
      narrativeMode: 'world', displayMode: 'text',
      persona: { name: '玩家', gender: '未指定', identity: '', relationship: '', personality: '', extra: '' },
      api: { model: 'mock-local', baseUrl: 'https://invalid.example/v1', key: 'fake-for-test' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 64000, cache: true },
      scenePresentation: { mode: selectedMode, status: 'native' }
    };
    BAOSceneHTML.prefs.mode = selectedMode;
    BAOSceneHTML.prefs.status = 'native';
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.messages[0].greeting = true;
    App.renderChatShell(true);
    App.showView('chat');
    BAOSceneHTML.refresh();
  }, mode);
}

test('Yume authored HTML greeting renders consistently on fresh and restored stories', async ({ page }) => {
  await prepareYume(page);
  const greeting = page.locator('#chat-stream > .message.assistant').first().locator('.bubble');
  await expect(greeting.locator('.bao-yume-opening')).toBeVisible();
  await expect(greeting.locator('img')).toHaveAttribute('src', 'assets/yume-yume-rain-v4.webp');
  await expect(greeting).toContainText('Club Rose');
  expect(await greeting.innerText()).not.toContain('<div class=');

  await page.evaluate(() => {
    App.renderChatShell(false);
    BAOSceneHTML.refresh();
    BAOStoryReader.decorateStream();
  });
  await expect(greeting.locator('.bao-yume-opening')).toBeVisible();

  await page.evaluate(() => {
    BAOSceneHTML.prefs.mode = 'native';
    BAOSceneHTML.refresh();
    BAOStoryReader.decorateStream();
  });
  await expect(greeting.locator('.bao-yume-opening')).toHaveCount(0);
  await expect(greeting).toContainText('Club Rose');
  expect(await greeting.innerText()).not.toContain('<div class=');

  await page.evaluate(() => {
    BAOSceneHTML.prefs.mode = 'efficient';
    App.renderChatShell(false);
    BAOSceneHTML.refresh();
  });
  await expect(greeting.locator('.bao-yume-opening')).toBeVisible();
});

test('text mode shows structured state and preserves legacy [STATUS] without exposing markup', async ({ page }) => {
  await prepareYume(page);
  await page.evaluate(() => {
    GameState.current.time = '靈曆三千年・辰時';
    GameState.current.location = '青嵐坊市';
    App.activeCharacter.world_modules = [{
      id: 'cultivation', icon: '☯', label: '修為', kind: 'object', context: 'core', tracking: 'medium',
      fields: [{ key: 'realm', label: '境界' }, { key: 'power', label: '靈力' }]
    }];
    BAOWorldModules.ensureState(App.activeCharacter);
    GameState.current.modules.cultivation = { realm: '凡俗', power: 80 };
    Chat.add('user', '我走進茶樓');
    Chat.add('assistant', '侍者遞來一盞茶。\n[STATUS]\n氣運：120\n關係：陌生\n[/STATUS]');
    App.renderChatShell(false);
    BAOSceneHTML.refresh();
    BAOStoryReader.decorateStream();
  });
  const dock = page.locator('#bao-inline-story-status');
  await expect(dock).toBeVisible();
  await expect(dock).toContainText('靈曆三千年・辰時');
  await expect(dock).toContainText('青嵐坊市');
  await expect(dock).toContainText('境界：凡俗');
  await expect(dock).toContainText('靈力：80');
  await expect(dock).toContainText('氣運：120');
  const lastBubble = page.locator('#chat-stream > .message.assistant .bubble').last();
  await expect(lastBubble).toContainText('侍者遞來一盞茶。');
  await expect(lastBubble).not.toContainText('[STATUS]');
  expect(await page.evaluate(() => Chat.messages.at(-1).content)).toContain('[STATUS]');

  await page.evaluate(() => { BAOSceneHTML.prefs.status = 'author'; BAOSceneHTML.refresh(); });
  await expect(dock).toContainText('氣運：120');
  await page.evaluate(() => { BAOSceneHTML.prefs.status = 'hidden'; BAOSceneHTML.refresh(); });
  await expect(dock).toBeHidden();
  await page.evaluate(() => { BAOSceneHTML.prefs.status = 'native'; BAOSceneHTML.refresh(); });
  await expect(dock).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dock).toBeVisible();
  expect(await dock.evaluate(el => el.previousElementSibling?.id === 'chat-stream')).toBe(true);
});

test('a standalone legacy greeting does not remain HTML-escaped', async ({ page }) => {
  await prepareYume(page);
  await page.evaluate(() => {
    Chat.reset();
    App.renderChatShell(true);
    BAOSceneHTML.refresh();
    BAOStoryReader.decorateStream();
  });
  const greeting = page.locator('#chat-stream > .message.assistant').first();
  await expect(greeting.locator('.bao-yume-opening')).toBeVisible();
  await expect(greeting).toContainText('歌舞伎町');
  expect(await greeting.innerText()).not.toContain('<div class=');
});

for (const displayMode of ['text', 'ui']) {
  test(`persisted intimacy theme renders Yume opening and status safely in ${displayMode}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bao-lab:scene-view-v1', JSON.stringify({ enabled: true, type: 'intimacy' })));
    await prepareYume(page);
    await page.waitForFunction(() => Boolean(window.BAOSceneChat && window.BAOSceneRenderIntegrity));
    await page.evaluate(mode => {
      App.config.displayMode = mode;
      App.renderChatShell(false);
      BAOSceneRenderIntegrity.reconcile();
    }, displayMode);
    const bubble = page.locator('#chat-stream > .message.assistant .bubble').first();
    await expect(bubble.locator('.bao-scene-heading')).toHaveText('成人親密');
    await expect(bubble).not.toContainText('<div class=');
    await expect(bubble.locator('.bao-yume-opening img')).toHaveAttribute('src', 'assets/yume-yume-rain-v4.webp');
    await page.evaluate(() => {
      Chat.add('user', '繼續');
      Chat.add('assistant', '<p>門邊的雨聲。</p><img src="javascript:alert(1)" onerror="window.__unsafe=true"><script>window.__unsafe=true</script>\n[STATUS]氣運：120[/STATUS]');
      App.renderChatShell(false);
      BAOStoryReader.decorateStream();
      BAOSceneRenderIntegrity.reconcile();
    });
    const last = page.locator('#chat-stream > .message.assistant .bubble').last();
    await expect(last).toContainText('門邊的雨聲。');
    await expect(last).not.toContainText('<p>');
    await expect(last).not.toContainText('[STATUS]');
    await expect(page.locator('#bao-inline-story-status')).toContainText('氣運：120');
    expect(await last.locator('script,[onerror],[src^="javascript:"]').count()).toBe(0);
    expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
    await page.evaluate(() => {
      BAOSceneChat.prefs.enabled = false;
      BAOSceneChat.paint();
      BAOSceneHTML.prefs.mode = 'native';
      BAOSceneHTML.refresh();
      BAOSceneChat.prefs.enabled = true;
      BAOSceneChat.prefs.type = 'mystery';
      BAOSceneChat.paint();
    });
    await expect(bubble).not.toContainText('<div class=');
    await expect(bubble).toContainText('Club Rose');
    await page.evaluate(() => {
      BAOSceneHTML.prefs.mode = 'efficient';
      Chat.reset();
      App.renderChatShell(true);
      BAOSceneRenderIntegrity.reconcile();
    });
    await expect(bubble).not.toContainText('<div class=');
    await expect(bubble.locator('.bao-yume-opening img')).toHaveCount(1);
  });
}

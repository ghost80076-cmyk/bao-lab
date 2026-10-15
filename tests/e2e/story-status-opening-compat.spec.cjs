const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });


test('core chat shell never exposes authored greeting source even if scene renderer is late', async ({ page }) => {
  await page.route('**/js/scene-html-modes.js*', route => route.abort());
  await page.goto(process.env.BAO_LIVE_URL ? './?verify=' + (process.env.GITHUB_SHA || Date.now()) : '/');
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
  await page.goto(process.env.BAO_LIVE_URL ? './?verify=' + (process.env.GITHUB_SHA || Date.now()) : '/');
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
  test(`persisted intimacy theme renders Yume opening and status safely in ${displayMode}`, async ({ page }, testInfo) => {
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
      Chat.add('assistant', '<p>門邊的雨聲。It\'s raining.</p><img src="javascript:alert(1)" onerror="window.__unsafe=true"><script>window.__unsafe=true</script>\n[STATUS]氣運：120[/STATUS]');
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
    const restored = await page.evaluate(() => {
      const original = JSON.stringify(Chat.messages);
      const save = Storage.buildStoryPayload('theme-compat-roundtrip');
      Chat.reset();
      if (!Storage.restoreStory(save)) throw new Error('Story restore failed');
      App.renderChatShell(false);
      BAOSceneRenderIntegrity.reconcile();
      return JSON.stringify(Chat.messages) === original;
    });
    expect(restored).toBe(true);
    await expect(bubble).not.toContainText('<div class=');
    await expect(page.locator('#bao-inline-story-status')).toContainText('氣運：120');

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
    await page.screenshot({ path: testInfo.outputPath('yume-themed-opening.png'), fullPage: true });
  });
}

for (const viewport of [{width:1280,height:900}, {width:390,height:844}]) {
  test(`Three Realms work restores cultivation and bounded lore in ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    let modelCalls = 0;
    page.on('request', request => { if (request.method() === 'POST') modelCalls++; });
    await page.goto('./');
    await page.waitForFunction(() => Boolean(App.characters?.length && Storage.status().ready &&
      window.BAOSceneHTML && window.BAOStoryReader && window.BAOWorldModules && window.YoruWorldbookLibrary));
    const result = await page.evaluate(async () => {
      App.activeCharacter = await App.loadCharacter('zhutian-cultivation-fortune-strife');
      if (!App.activeCharacter) throw new Error('Cultivation work missing');
      App.config = {narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},
        api:{model:'mock',baseUrl:'https://example.invalid/v1',key:'test-only'},
        memory:{mode:'rounds',maxRounds:20,maxContext:64000,cache:true},
        scenePresentation:{mode:'native',status:'native'}};
      BAOSceneHTML.prefs.mode = 'native';
      BAOSceneHTML.prefs.status = 'native';
      Chat.reset(); GameState.create(App.activeCharacter,App.config);
      BAOWorldModules.applyCustomization({enabledBuiltIns:['three_realms_cultivation']});
      GameState.current.modules.three_realms_cultivation = {route:'下界鬥氣',realm:'鬥宗',energy:30,energy_max:100};
      GameState.current.time = '辰時'; GameState.current.location = '天道宗';
      const catalog = await YoruWorldbookLibrary.loadCatalog();
      const pack = catalog.find(p => p.meta.id === 'three-realms-lower-sects');
      if (!pack) throw new Error('Sect worldbook missing');
      GameState.current.worldbookLibrary = {version:1,enabled:[pack.meta.id],installed:[],pinned:{[pack.meta.id]:pack}};
      Chat.add('assistant', App.activeCharacter.greeting);
      Chat.messages[0].greeting = true;
      Chat.add('user','我想了解天道宗。');
      Chat.add('assistant','山門前的侍者介紹天道宗。\n[STATUS]氣運：120[/STATUS]');
      App.renderChatShell(true); App.showView('chat');
      BAOSceneHTML.refresh(); BAOStoryReader.decorateStream();
      const selected = YoruWorldbookLibrary.select([pack],[pack.meta.id],{
        ...YoruWorldbookLibrary.signals(),world:'three-realms'}, {maxEntries:4,maxChars:2200});
      const messages = await App.buildMessages(App.config);
      const raw = JSON.stringify(Chat.messages);
      const save = Storage.buildStoryPayload('three-realms-integration');
      Chat.reset();
      if (!Storage.restoreStory(save)) throw new Error('Restore failed');
      App.renderChatShell(false); BAOSceneHTML.refresh(); BAOStoryReader.decorateStream();
      return {state:GameState.current.modules.three_realms_cultivation,
        rawPreserved:raw === JSON.stringify(Chat.messages),
        pack:GameState.current.worldbookLibrary.enabled,
        selectedChars:selected.text.length,
        recalled:messages.some(m => m.content?.includes('世界書按需提供的背景資料')),
        selected:selected.text.includes('天道宗')};
    });
    expect(result.state).toMatchObject({route:'下界鬥氣',realm:'鬥宗',energy:30,energy_max:100});
    expect(result.rawPreserved).toBe(true);
    expect(result.pack).toEqual(['three-realms-lower-sects']);
    expect(result.selectedChars).toBeGreaterThan(0);
    expect(result.selectedChars).toBeLessThanOrEqual(2200);
    expect(result.recalled).toBe(true);
    expect(result.selected).toBe(true);
    const dock = page.locator('#bao-inline-story-status');
    await expect(dock).toBeVisible();
    await expect(dock).toContainText('鬥宗');
    await expect(dock).toContainText('天道宗');
    await expect(dock).toContainText('氣運：120');
    const bubble = page.locator('#chat-stream > .message.assistant .bubble').last();
    await expect(bubble).not.toContainText('[STATUS]');
    expect(modelCalls).toBe(0);
  });
}


test('worldbook condition controls preserve opt-in and never display locked content', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.YoruWorldbookLibrary && Storage.status().ready));
  await page.evaluate(() => {
    GameState.current = { id: 'worldbook-conditions-test', npcs: [], events: [], worldbookLibrary: {
      version: 1, enabled: ['condition-test'], pinned: {}, installed: [{
        schema: 'yorubay-worldbook-pack', version: 1,
        meta: { id: 'condition-test', name: '私人測試包', world: 'general' },
        entries: [{ id: 'evidence', title: '不應顯示的條目標題', mode: 'keyword', keywords: ['證據'],
          requires: ['evidence-known'], content: '不應顯示的秘密正文' }]
      }]
    }};
    YoruWorldbookLibrary.open();
  });
  const dialog = page.getByRole('dialog', { name: '世界書', exact: true });
  const privateBook = dialog.locator('.ylb-collection').filter({ hasText: '私人測試包' }).first();
  await privateBook.getByText('查看章節', { exact: true }).click();
  await expect(privateBook.getByText('已得知資訊（1 項）')).toBeVisible();
  await privateBook.getByText('已得知資訊（1 項）').click();
  const condition = privateBook.locator('[data-ylb-condition="evidence-known"]');
  await expect(condition).not.toBeChecked();
  await expect(dialog).not.toContainText('不應顯示的秘密正文');
  await expect(dialog).not.toContainText('不應顯示的條目標題');
  await condition.check();
  await expect.poll(() => page.evaluate(() => GameState.current.worldbookFlags)).toEqual(['evidence-known']);
  await expect(privateBook.getByText('已得知資訊（1 項）')).toBeVisible();
  await condition.uncheck();
  await expect.poll(() => page.evaluate(() => GameState.current.worldbookFlags)).toEqual([]);
});

const { test, expect } = require('@playwright/test');

test('Three Realms cultivation can be enabled, viewed and restored per story on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOWorldModuleManager && window.BAOThreeRealmsCultivation && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: 'three-realms-state-test', world_modules: [] };
    App.config = { narrativeMode: 'world', displayMode: 'ui', api: { model: 'mock' }, persona: { name: '修士' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 32000 } };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    BAOWorldModuleManager.open();
  });
  const dialog = page.getByRole('dialog', { name: '世界模組管理' });
  await expect(dialog.getByText('三界修煉', { exact: true })).toBeVisible();
  await dialog.locator('[data-preset-id="three_realms_cultivation"]').check();
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await page.evaluate(() => BAOWorldModuleUI.renderModule('three_realms_cultivation'));
  const panel = page.locator('#ui-panel');
  await expect(panel).toContainText('尚未確認修煉狀態');
  await page.evaluate(() => {
    const source = '我是鬥宗，鬥氣30，上限100，業力輕微';
    const update = BAOHelperData.stateUpdate({ modules: { three_realms_cultivation: {
      route: '下界鬥氣', realm: '鬥宗', energy: 30, energy_max: 100, karma: '輕微', evidence: source
    } } }, GameState.current.moduleDefinitions, source);
    GameState.applyUpdate(update);
    GameState.current = JSON.parse(JSON.stringify(GameState.current));
    BAOWorldModules.ensureState(App.activeCharacter);
    BAOWorldModuleUI.renderModule('three_realms_cultivation');
    App.saveStory(false);
  });
  await expect(panel).toContainText('下界鬥氣');
  await expect(panel).toContainText('鬥宗');
  await expect(panel).toContainText('剩餘力量');
  await expect(panel).toContainText('輕微');
  const saved = await page.evaluate(() => {
    const save = Storage.loadStory();
    return { realm: save?.state?.modules?.three_realms_cultivation?.realm, enabled: save?.state?.worldModuleCustomization?.enabledBuiltIns?.includes('three_realms_cultivation') };
  });
  expect(saved).toEqual({ realm: '鬥宗', enabled: true });
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.evaluate(() => BAOWorldModuleManager.open());
  await dialog.locator('[data-preset-id="three_realms_cultivation"]').uncheck();
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  const state = await page.evaluate(() => ({ active: BAOWorldModules.definitions(App.activeCharacter).some(d => d.id === 'three_realms_cultivation'), realm: GameState.current.modules.three_realms_cultivation.realm }));
  expect(state).toEqual({ active: false, realm: '鬥宗' });
});

test('mobile world module manager puts active story modules before presets and guides', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOWorldModuleManager && window.BAOWorldModules && App.characters?.length));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      id: 'mobile-world-density-test',
      world_modules: [
        {
          id: 'story_journal',
          label: '故事日誌',
          icon: '✦',
          description: '測試用故事模組',
          context: 'relevant',
          tracking: 'medium',
          kind: 'collection',
          fields: []
        }
      ]
    };
    App.config = {
      persona: { name:'手機玩家', identity:'旅人', relationship:'' },
      narrativeMode:'immersive',
      displayMode:'ui',
      api: { model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key' },
      memory: { maxRounds:20, maxContext:32000, mode:'smart', cache:true }
    };
    GameState.create(App.activeCharacter, App.config);
    BAOWorldModuleManager.open();
  });

  const dialog = page.getByRole('dialog', { name:'世界模組管理' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.world-manager-head .eyebrow')).toBeHidden();
  await expect(dialog.locator('#world-manager-intro')).toBeHidden();
  await expect(dialog.locator('[data-world-section="official"]')).toContainText('官方模組');
  await expect(dialog.locator('[data-world-section="official"]')).toContainText('作品預設');
  await expect(dialog.locator('[data-world-section="mine"]')).toContainText('我的模組');

  const help = dialog.getByRole('button', { name:'世界模組管理說明' });
  await expect(help).toBeVisible();
  await help.click();
  await expect(dialog.locator('#world-manager-intro')).toBeVisible();
  await help.click();
  await expect(dialog.locator('#world-manager-intro')).toBeHidden();

  const layout = await dialog.evaluate(node => {
    const order = node.querySelector('.world-manager-order-card').getBoundingClientRect();
    const presets = node.querySelector('.world-manager-presets-card').getBoundingClientRect();
    const custom = node.querySelector('.world-manager-custom-card-list').getBoundingClientRect();
    const guide = node.querySelector('.world-manager-guide').getBoundingClientRect();
    const footer = node.querySelector('.world-manager-foot');
    const presetGrid = node.querySelector('.world-manager-presets');
    const technicalId = node.querySelector('.world-order-row small');
    return {
      orderBeforePresets: order.top < presets.top,
      presetsBeforeCustom: presets.top < custom.top,
      customBeforeGuide: custom.top < guide.top,
      footerPosition: getComputedStyle(footer).position,
      presetColumns: getComputedStyle(presetGrid).gridTemplateColumns.trim().split(/\s+/).length,
      technicalIdHidden: technicalId ? getComputedStyle(technicalId).display === 'none' : true
    };
  });

  expect(layout).toEqual({
    orderBeforePresets: true,
    presetsBeforeCustom: true,
    customBeforeGuide: true,
    footerPosition: 'sticky',
    presetColumns: 2,
    technicalIdHidden: true
  });

  await dialog.getByRole('button', { name:'＋ 自訂模組' }).click();
  await expect(dialog.locator('[data-custom-id]')).toHaveCount(1);
  await expect(dialog.locator('[data-custom-id] [data-custom-prop="label"]')).toBeVisible();
});

test('Three Realms events are opt-in, fill without sending, and guide only the requested turn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOWorldModuleManager && window.BAOThreeRealmsEvents && window.BAOStoryQuickCommands && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: 'three-realms-events-mobile-test', world_modules: [] };
    App.config = { narrativeMode: 'world', displayMode: 'ui', api: { model: 'mock' }, persona: { name: '修士' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 32000 } };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    BAOStoryQuickCommands.open();
  });
  let quick = page.getByRole('dialog', { name: '快捷指令' });
  await expect(quick.locator('[data-quick-source="event"]')).toHaveCount(0);
  await quick.getByRole('button', { name: '關閉快捷指令' }).click();
  await page.evaluate(() => BAOWorldModuleManager.open());
  const manager = page.getByRole('dialog', { name: '世界模組管理' });
  await manager.locator('[data-preset-id="three_realms_events"]').check();
  await manager.getByRole('button', { name: '套用到目前故事' }).click();
  await page.evaluate(() => BAOWorldModuleUI.renderModule('three_realms_events'));
  await expect(page.locator('#ui-panel')).toContainText('按需引導');
  await expect(page.locator('#ui-panel')).not.toContainText('目前沒有資料');
  await page.locator('#user-input').fill('我想去坊市');
  await page.evaluate(() => BAOStoryQuickCommands.open());
  quick = page.getByRole('dialog', { name: '快捷指令' });
  await expect(quick.locator('[data-quick-source="event"]')).toHaveCount(11);
  await expect(quick.locator('[data-quick-id="three-realms-exploration"]')).toBeVisible();
  const before = await page.evaluate(() => Chat.messages.length);
  await quick.locator('[data-quick-id="three-realms-exploration"]').click();
  await expect(page.locator('#user-input')).toHaveValue('我想去坊市\n【探索事件】');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(before);
  const requested = await page.evaluate(async () => {
    Chat.add('user', document.getElementById('user-input').value);
    const messages = await App.buildMessages(App.config);
    App.saveStory(false);
    return { prompts: messages.filter(m => typeof m.content === 'string' && m.content.includes('【三界事件引導｜')).map(m => m.content), saved: Storage.loadStory()?.state?.worldModuleCustomization?.enabledBuiltIns?.includes('three_realms_events') };
  });
  expect(requested.prompts).toHaveLength(1);
  expect(requested.prompts[0]).toContain('探索事件');
  expect(requested.saved).toBe(true);
  const next = await page.evaluate(async () => {
    Chat.add('assistant', '入口旁仍有線索。');
    Chat.add('user', '繼續');
    return (await App.buildMessages(App.config)).filter(m => typeof m.content === 'string' && m.content.includes('【三界事件引導｜')).length;
  });
  expect(next).toBe(0);
  await page.evaluate(() => BAOWorldModuleManager.open());
  await manager.locator('[data-preset-id="three_realms_events"]').uncheck();
  await manager.getByRole('button', { name: '套用到目前故事' }).click();
  await page.evaluate(() => BAOStoryQuickCommands.open());
  quick = page.getByRole('dialog', { name: '快捷指令' });
  await expect(quick.locator('[data-quick-source="event"]')).toHaveCount(0);
});

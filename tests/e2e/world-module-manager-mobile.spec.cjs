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

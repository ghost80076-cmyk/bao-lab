const { test, expect } = require('@playwright/test');

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

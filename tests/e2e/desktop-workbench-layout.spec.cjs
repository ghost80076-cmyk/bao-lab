const { test, expect } = require('@playwright/test');

async function prepareStory(page, id) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOCharacterStatusUI &&
    window.BAOWorldModuleManager &&
    window.BAOContextHealth &&
    App.characters?.length
  ));
  await page.evaluate(testId => {
    App.activeCharacter = { ...App.characters[0], id: testId };
    App.config = {
      persona: { name: '桌面玩家', identity: '旅人', relationship: '' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: { model: 'mock-desktop-workbench', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting || '夜灣仍替你留著燈。');
  }, id);
}

test('desktop status manager keeps field editing primary and reference content in a compact rail', async ({ page }) => {
  await prepareStory(page, 'desktop-status-workbench');
  await page.evaluate(() => BAOCharacterStatusUI.openSettings());

  const dialog = page.getByRole('dialog', { name: '狀態欄管理' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('link[href^="css/character-status.css"]')?.sheet);

  const layout = await dialog.evaluate(node => {
    const modal = node.getBoundingClientRect();
    const fields = node.querySelector('.status-manager-fields-card').getBoundingClientRect();
    const templates = node.querySelector('.status-manager-templates').getBoundingClientRect();
    const guide = node.querySelector('.status-manager-body > aside').getBoundingClientRect();
    const guideStyle = getComputedStyle(node.querySelector('.status-manager-body > aside'));
    return {
      modalWidth: Math.round(modal.width),
      fieldsLeftOfTemplates: fields.right <= templates.left,
      fieldsWiderThanTemplates: fields.width > templates.width * 2,
      guideAlignedWithTemplates: Math.abs(guide.left - templates.left) < 4,
      guidePosition: guideStyle.position
    };
  });

  expect(layout.modalWidth).toBeGreaterThan(1100);
  expect(layout.fieldsLeftOfTemplates).toBe(true);
  expect(layout.fieldsWiderThanTemplates).toBe(true);
  expect(layout.guideAlignedWithTemplates).toBe(true);
  expect(layout.guidePosition).toBe('sticky');
});

test('desktop world manager separates current story editing from presets and reference guidance', async ({ page }) => {
  await prepareStory(page, 'desktop-world-workbench');
  await page.evaluate(() => BAOWorldModuleManager.open());

  const dialog = page.getByRole('dialog', { name: '世界模組管理' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('link[href^="css/world-module-manager.css"]')?.sheet);

  const layout = await dialog.evaluate(node => {
    const order = node.querySelector('.world-manager-order-card').getBoundingClientRect();
    const custom = node.querySelector('.world-manager-custom-card-list').getBoundingClientRect();
    const presets = node.querySelector('.world-manager-presets-card').getBoundingClientRect();
    const guide = node.querySelector('.world-manager-guide').getBoundingClientRect();
    const guideStyle = getComputedStyle(node.querySelector('.world-manager-guide'));
    const presetColumns = getComputedStyle(node.querySelector('.world-manager-presets')).gridTemplateColumns.trim().split(/\s+/).length;
    return {
      orderLeftOfPresets: order.right <= presets.left,
      customBelowOrder: custom.top >= order.bottom,
      customLeftOfGuide: custom.right <= guide.left,
      guideAlignedWithPresets: Math.abs(guide.left - presets.left) < 4,
      guidePosition: guideStyle.position,
      presetColumns
    };
  });

  expect(layout).toEqual({
    orderLeftOfPresets: true,
    customBelowOrder: true,
    customLeftOfGuide: true,
    guideAlignedWithPresets: true,
    guidePosition: 'sticky',
    presetColumns: 2
  });
});

test('desktop context health uses parallel summary and diagnostic columns', async ({ page }) => {
  await prepareStory(page, 'desktop-context-workbench');
  await page.evaluate(() => {
    Chat.lastStoryPromptTokens = 32000;
    Chat.contextGuard = { level: 'normal', ratio: 0.5, recentRounds: 18 };
    Chat.summary = '桌面測試摘要。';
    Chat.summarizedUntil = 1;
    Chat.usageLedger = [{ kind: 'story', model: 'mock-desktop-workbench', input: 32000, output: 900, cached: 6000, at: new Date().toISOString() }];
    BAOContextHealth.open();
  });

  const dialog = page.getByRole('dialog', { name: '上下文狀態' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('link[href^="css/context-health.css"]')?.sheet);

  const layout = await dialog.evaluate(node => {
    const panel = node.getBoundingClientRect();
    const hero = node.querySelector('.context-health-hero').getBoundingClientRect();
    const cards = node.querySelector('.context-health-cards').getBoundingClientRect();
    const footer = node.querySelector('.context-health-footer').getBoundingClientRect();
    const layers = node.querySelector('.context-health-layers').getBoundingClientRect();
    const advanced = node.querySelector('.context-health-advanced').getBoundingClientRect();
    const columns = getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length;
    return {
      panelWidth: Math.round(panel.width),
      columns,
      heroLeftOfLayers: hero.right <= layers.left,
      cardsLeftOfLayers: cards.right <= layers.left,
      footerLeftOfAdvanced: footer.right <= advanced.left
    };
  });

  expect(layout.panelWidth).toBeGreaterThan(980);
  expect(layout.columns).toBe(2);
  expect(layout.heroLeftOfLayers).toBe(true);
  expect(layout.cardsLeftOfLayers).toBe(true);
  expect(layout.footerLeftOfAdvanced).toBe(true);
});

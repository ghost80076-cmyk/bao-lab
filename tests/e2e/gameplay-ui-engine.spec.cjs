const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof CharacterEngine !== 'undefined' && window.BAOGameplayUI && window.BAOGameplayUICore);
  await page.waitForTimeout(500);
}

test('legacy cards without gameplay_ui do not get the new builder', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'legacy-ui-test',
      name: 'Legacy UI Test',
      system_prompt: 'test',
      greeting: 'hello',
      initial_state: {}
    });
    App.openBuilder();
  });
  await expect(page.locator('#bao-gameplay-builder')).toHaveCount(0);
});

test('gameplay schema renders builder, applies state, and drafts actions without auto-send', async ({ page }) => {
  await ready(page);
  const card = await page.evaluate(async () => (await fetch('tests/fixtures/gameplay-ui-demo-character.json')).json());
  await page.evaluate(raw => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.openBuilder();
    App.setStep(3);
  }, card);

  const builder = page.locator('#bao-gameplay-builder');
  await expect(builder).toBeVisible();
  await expect(builder).toHaveAttribute('data-gameplay-theme', 'stage-neon');
  await expect(builder).toHaveAttribute('data-gameplay-density', 'compact');
  expect(await builder.evaluate(node => node.style.getPropertyValue('--gameplay-accent'))).toBe('#c78cff');
  await expect(builder).toContainText('剩餘 6 / 6');

  const plus = page.locator('[data-gameplay-attribute="strength"] [data-gameplay-step="plus"]');
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(builder).toContainText('剩餘 3 / 6');
  await page.locator('[data-gameplay-field="origin"]').selectOption('世家子弟');

  await page.evaluate(() => {
    const config = App.collectConfig();
    config.displayMode = 'ui';
    App.config = config;
    GameState.create(App.activeCharacter, config);
    App.showView('chat');
    BAOGameplayUI.renderPanel('status');
  });

  await page.evaluate(() => {
    window.BAOChatExperience?.sync?.();
    BAOGameplayUI.syncDashboardLayout();
  });
  const panel = page.locator('#ui-panel');
  const gameUI = page.locator('#game-ui');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-gameplay-layout', 'rpg-dashboard');
  await expect(page.locator('#bao-gameplay-dashboard-left')).toContainText('700 / 810');
  await expect(page.locator('#bao-gameplay-dashboard-left')).toContainText('世家子弟');
  await expect(page.locator('#bao-gameplay-dashboard-right')).toContainText('青雲城');
  await expect(page.locator('#bao-gameplay-dashboard-right')).toContainText('宗門試煉');
  await expect(gameUI).toHaveAttribute('data-gameplay-theme', 'stage-neon');
  await expect(gameUI).toHaveAttribute('data-gameplay-meter', 'glow');
  await expect(panel).toContainText('700 / 810');
  await expect(panel).toContainText('力量');
  await expect(panel).toContainText('11');
  await expect(panel).toContainText('世家子弟');

  const drafted = await page.evaluate(() => {
    BAOGameplayUI.renderPanel('combat');
    const action = document.querySelector('[data-gameplay-draft-text]');
    if (!action) return '';
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return document.getElementById('user-input')?.value || '';
  });
  expect(drafted).toBe('我採取穩健策略迎戰，優先保命並觀察對手破綻。');
});


test('dual host system card maps global Persona display to system identity without changing Persona data', async ({ page }) => {
  await ready(page);
  const card = await page.evaluate(async () => (await fetch('data/characters/community/db/dual-host-system-mode.json')).json());

  await page.evaluate(raw => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.config = {
      narrativeMode: 'world',
      displayMode: 'text',
      persona: { name: '未命名玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      gameplaySetup: { player_mode: '純系統' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
  }, card);

  const identitySnapshot = await page.evaluate(() => ({
    sourcePath: App.activeCharacter?.gameplay_ui?.player_identity?.source_path || '',
    playerMode: GameState.current?.modules?.system_core?.player_mode || ''
  }));
  expect(identitySnapshot).toEqual({
    sourcePath: 'modules.system_core.player_mode',
    playerMode: '純系統'
  });
  await expect(page.locator('#chat-persona')).toHaveText('系統本體');

  await page.evaluate(() => {
    App.config.persona.name = '班長測試化身';
    GameState.current.modules.system_core.player_mode = '系統＋化身';
    BAOGameplayUI.syncPlayerIdentityLabel();
  });
  await expect(page.locator('#chat-persona')).toHaveText('班長測試化身');

  await page.evaluate(() => {
    App.config.persona.name = '未命名玩家';
    BAOGameplayUI.syncPlayerIdentityLabel();
  });
  await expect(page.locator('#chat-persona')).toHaveText('系統化身');
  expect(await page.evaluate(() => App.config.persona.name)).toBe('未命名玩家');
});

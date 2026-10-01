const { test, expect } = require('@playwright/test');

test('NPC roster edits the existing presence state and supports bulk registration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStatusUI && window.BAOCharacterStatus && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name:'玩家', gender:'未指定', identity:'', personality:'', relationship:'', extra:'' },
      narrativeMode:'immersive', displayMode:'ui',
      api: {model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key'},
      memory: {maxRounds:20, maxContext:32000, mode:'rounds', cache:true}
    };
    GameState.create(App.activeCharacter, App.config);
    GameState.current.location = '書店';
    GameState.upsertNPC({ name:'阿青', role:'店員', location:'書店', presence:'present' });
    GameState.upsertNPC({ name:'小周', role:'訪客', presence:'away' });
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    App.renderUIPanel('npc');
  });

  await page.locator('[data-npc-roster-open]').click();
  await expect(page.getByRole('dialog', { name:'NPC 名冊／場景參與者' })).toBeVisible();
  await expect(page.locator('[data-roster-scene="阿青"]')).toBeChecked();
  await expect(page.locator('[data-roster-scene="小周"]')).not.toBeChecked();

  await page.locator('[data-roster-bulk]').fill('瑪莉｜女僕\n威廉｜公爵');
  await page.locator('[data-roster-add]').click();
  await expect(page.locator('.npc-roster-row')).toHaveCount(4);
  await page.locator('[data-roster-scene="阿青"]').uncheck();
  await page.locator('[data-roster-scene="小周"]').check();
  await page.locator('[data-roster-save]').click();

  const state = await page.evaluate(() => ({
    roster: GameState.current.npcs.map(npc => ({ name:npc.name, role:npc.role, presence:npc.presence, location:npc.location })),
    scene: BAOCharacterStatus.sceneNPCs().map(npc => npc.name)
  }));
  expect(state.scene).toEqual(['小周']);
  expect(state.roster.find(npc => npc.name === '阿青').presence).toBe('away');
  expect(state.roster.find(npc => npc.name === '小周')).toMatchObject({ presence:'present', location:'書店' });
  expect(state.roster.find(npc => npc.name === '瑪莉').role).toBe('女僕');
  expect(state.roster.find(npc => npc.name === '威廉').role).toBe('公爵');
});

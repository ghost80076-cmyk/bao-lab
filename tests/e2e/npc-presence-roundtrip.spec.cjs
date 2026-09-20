const { test, expect } = require('@playwright/test');

if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const width of [390, 1440]) {
  test(`NPC presence stays in sync with the panel and persisted story at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.App?.characters?.some(c => c.id === 'autonomous-npc-world') &&
      Storage.status().ready && window.BAOStateTrackerRepairs && window.BAOCharacterStatusUI, null, { timeout: 15000 });
    await page.evaluate(() => {
      App.openCharacter('autonomous-npc-world');
      App.openBuilder();
      document.getElementById('bao-demo-mode').checked = true;
      App.startStory();
      App.config.displayMode = 'ui';
      GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView('chat');
    });

    const applyModelResponse = async (patch) => page.evaluate(async data => {
      const config = {
        ...App.config,
        narrativeMode: 'world',
        displayMode: 'ui',
        cost: { ...(App.config.cost || {}), stateInterval: 1, stateApi: null, stateModel: '' },
        api: { ...App.config.api, model: 'browser-mock', key: 'MOCK_ONLY_NOT_SAVED' }
      };
      const send = API.send;
      API.send = async () => ({ text: JSON.stringify(data) });
      try {
        const result = await WorldStateEngine.update(config, '玩家確認目前場景', '本輪故事明確描述 NPC 的進出。');
        App.renderUIPanel('npc');
        return { result, npcs: structuredClone(GameState.current.npcs), phase: GameState.current.stateTracker?.phase };
      } finally {
        API.send = send;
      }
    }, patch);

    const inScene = await applyModelResponse({ npcs: [
      { name: '阿青', role: '店員', location: '書店', presence: 'present' },
      { name: '小周', role: '訪客', presence: 'unknown' }
    ] });
    expect(inScene.phase).toBe('updated');
    expect(inScene.npcs.find(n => n.name === '阿青').presence).toBe('present');
    const card = page.locator('.character-status-card[data-character-context="阿青"]');
    await expect(card.locator('[data-npc-presence]')).toHaveText('在場');
    await expect(page.locator('.character-status-card[data-character-context="小周"] [data-npc-presence]')).toHaveText('行蹤未知');
    await expect(page.locator('.character-status-card[data-character-context="自主NPC世界(成熟內容支援)"] [data-npc-presence]')).toHaveCount(0);

    const left = await applyModelResponse({ npcs: [{ name: '阿青', presence: 'away' }] });
    expect(left.npcs.find(n => n.name === '阿青').presence).toBe('away');
    await expect(card.locator('[data-npc-presence]')).toHaveText('已離場');
    // A later patch that does not mention presence must not overwrite it.
    await applyModelResponse({ npcs: [{ name: '阿青', mood: '平靜' }] });
    await expect(card.locator('[data-npc-presence]')).toHaveText('已離場');

    await page.evaluate(async () => {
      App.config.api.key = 'DO_NOT_EXPORT_THIS_KEY';
      GameState.current.config = App.config;
      const slot = Storage.saveSlot('NPC_presence_roundtrip');
      if (!slot) throw new Error('Failed to save a test slot');
      await Storage.flush();
    });
    await page.reload();
    await page.waitForFunction(() => window.App?.characters?.some(c => c.id === 'autonomous-npc-world') &&
      Storage.status().ready && window.BAOStateTrackerRepairs && window.BAOCharacterStatusUI, null, { timeout: 15000 });
    const restored = await page.evaluate(() => {
      const slot = Storage.listSlots().find(s => s.label === 'NPC_presence_roundtrip');
      if (!slot) return { ok: false, reason: 'slot not found' };
      const exported = JSON.stringify(slot);
      const ok = Storage.restoreStory(slot);
      if (ok) {
        App.config.displayMode = 'ui';
        App.renderChatShell(false);
        App.showView('chat');
        App.renderUIPanel('npc');
      }
      return { ok, leaked: exported.includes('DO_NOT_EXPORT_THIS_KEY') || exported.includes('MOCK_ONLY_NOT_SAVED'),
        presence: GameState.current?.npcs?.find(n => n.name === '阿青')?.presence,
        unknown: GameState.current?.npcs?.find(n => n.name === '小周')?.presence };
    });
    expect(restored).toEqual({ ok: true, leaked: false, presence: 'away', unknown: 'unknown' });
    await expect(page.locator('.character-status-card[data-character-context="阿青"] [data-npc-presence]')).toHaveText('已離場');
    await expect(page.locator('.character-status-card[data-character-context="小周"] [data-npc-presence]')).toHaveText('行蹤未知');
  });
}

const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const width of [390, 1440]) {
  test(`scene preferences stay with each story at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.App?.characters?.some(c => c.id === 'autonomous-npc-world') &&
      Storage.status().ready && window.BAOSceneStoryPreferences && App.__nativeAutonomousWorldStart &&
      document.getElementById('bao-demo-mode'), null, { timeout: 20000 });

    await page.evaluate(() => {
      App.openCharacter('autonomous-npc-world');
      App.openBuilder();
      document.getElementById('bao-demo-mode').checked = true;
      document.querySelector('input[name="display-mode"][value="text"]').checked = true;
      App.startStory();
      if (!GameState.current) throw new Error('No demo story created');
      App.showView('chat');
      GameState.upsertNPC({ name: '阿青', role: '旅人', presence: 'away' });
      App.renderUIPanel('npc');
      const controls = document.querySelectorAll('#bao-scene-controls select');
      if (controls.length !== 2) throw new Error('Scene controls did not mount');
      controls[0].value = 'free';
      controls[0].dispatchEvent(new Event('change', { bubbles: true }));
      controls[1].value = 'author';
      controls[1].dispatchEvent(new Event('change', { bubbles: true }));
      App.config.api.key = 'SCENE_STORY_TEST_SECRET';
      GameState.current.config = App.config;
    });
    const first = await page.evaluate(async () => {
      const a = Storage.saveSlot('scene_preference_A');
      if (!a) throw new Error('Could not save A');
      await Storage.flush();
      return { config: a.config.scenePresentation, state: a.state.npcs.find(n => n.name === '阿青')?.presence,
        secret: JSON.stringify(a).includes('SCENE_STORY_TEST_SECRET'),
        display: App.config.displayMode, current: { ...BAOSceneHTML.prefs } };
    });
    expect(first.config).toEqual({ mode: 'free', status: 'author' });
    expect(first.state).toBe('away');
    expect(first.secret).toBe(false);
    expect(first.display).toBe('text');
    expect(first.current).toEqual({ mode: 'free', status: 'author' });

    // The second saved story has different presentation but the same NPC data.
    // Restoring one must never change the other or start a model request.
    const switched = await page.evaluate(async () => {
      const second = Storage.buildStoryPayload('scene_preference_B');
      second.config.scenePresentation = { mode: 'native', status: 'hidden' };
      second.state.config.scenePresentation = { mode: 'native', status: 'hidden' };
      const b = Storage.importSlot(second);
      await Storage.flush();
      const ok = Storage.restoreStory(b);
      App.config.displayMode = 'ui';
      App.renderChatShell(false);
      const controls = [...document.querySelectorAll('#bao-scene-controls select')].map(select => select.value);
      return { ok, controls, prefs: { ...BAOSceneHTML.prefs }, npc: GameState.current.npcs.find(n => n.name === '阿青')?.presence };
    });
    expect(switched).toEqual({ ok: true, controls: ['native', 'hidden'],
      prefs: { mode: 'native', status: 'hidden' }, npc: 'away' });

    await page.reload();
    await page.waitForFunction(() => window.BAOSceneStoryPreferences && Storage.status().ready &&
      Storage.listSlots().some(slot => slot.label === 'scene_preference_A') &&
      Storage.listSlots().some(slot => slot.label === 'scene_preference_B'), null, { timeout: 20000 });
    const afterReload = await page.evaluate(() => {
      const a = Storage.listSlots().find(slot => slot.label === 'scene_preference_A');
      const b = Storage.listSlots().find(slot => slot.label === 'scene_preference_B');
      const safe = !JSON.stringify([a, b]).includes('SCENE_STORY_TEST_SECRET');
      const firstOk = Storage.restoreStory(a);
      App.renderChatShell(false);
      const firstMode = { ...BAOSceneHTML.prefs };
      const firstNpc = GameState.current.npcs.find(n => n.name === '阿青')?.presence;
      const secondOk = Storage.restoreStory(b);
      App.renderChatShell(false);
      const secondMode = { ...BAOSceneHTML.prefs };
      const secondNpc = GameState.current.npcs.find(n => n.name === '阿青')?.presence;
      return { firstOk, secondOk, firstMode, secondMode, firstNpc, secondNpc, safe };
    });
    expect(afterReload).toEqual({ firstOk: true, secondOk: true,
      firstMode: { mode: 'free', status: 'author' }, secondMode: { mode: 'native', status: 'hidden' },
      firstNpc: 'away', secondNpc: 'away', safe: true });
  });
}

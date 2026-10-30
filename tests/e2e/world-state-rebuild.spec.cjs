const { test, expect } = require('@playwright/test');

test('old story rebuilds from recent evidence, persists, and never edits prose', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOContextHealth && window.WorldStateEngine?.rebuild && App.characters?.length);
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], name: '重建測試', greeting: '你到了醫院。', world_modules: [] };
    App.config = { persona: { name: '旅人' }, narrativeMode: 'world', displayMode: 'ui', api: { model: 'mock', baseUrl: 'https://example.invalid', key: 'mock' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 64000 }, cost: { stateApiMode: 'same' } };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('user', '前往醫院'); Chat.add('assistant', '03:00，你已抵達醫院。');
    GameState.current.time = '02:16'; GameState.current.location = '公寓';
    window.__rebuildCalls = 0;
    API.send = async (_, messages) => {
      window.__rebuildCalls++;
      if (messages[1].content.includes('02:16')) throw new Error('stale evidence');
      return { text: JSON.stringify({ time: '03:00', location: '醫院', npcs: [], character_statuses: {} }) };
    };
    App.renderChatShell(false); App.showView('chat'); BAOContextHealth.open();
  });
  const dialog = page.getByRole('dialog', { name: '上下文狀態' });
  await expect(dialog.getByRole('button', { name: '重新整理狀態', exact: true })).toBeVisible();
  const original = await page.evaluate(() => JSON.stringify(Chat.messages));
  page.once('dialog', d => d.dismiss());
  await dialog.locator('[data-state-rebuild="recent"]').click();
  expect(await page.evaluate(() => window.__rebuildCalls)).toBe(0);
  page.once('dialog', d => d.accept());
  await dialog.locator('[data-state-rebuild="recent"]').click();
  await expect(dialog.locator('[data-state-rebuild-result]')).toHaveText('目前狀態已重新整理。');
  expect(await page.evaluate(() => GameState.current.location)).toBe('醫院');
  expect(await page.evaluate(() => JSON.stringify(Chat.messages))).toBe(original);
  expect(await page.evaluate(() => Storage.loadStory().state.location)).toBe('醫院');
  const width = await dialog.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

for (const width of [390, 1440]) {
  test(`authored module tabs and unsaved story rebuild stay aligned at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.BAOContextHealth && window.BAOWorldModuleUI && window.WorldStateEngine?.rebuild && window.BAOStorageWriteGuard && App.characters?.length);
    await page.evaluate(async () => {
      App.activeCharacter = await App.loadCharacter('heart-contract-custom-lover');
      App.activeCharacter.world_modules.push({ id: 'player_notes', label: '手動筆記', kind: 'object', tracking: 'manual', fields: [{ key: 'text', type: 'text' }] });
      App.config = { persona: { name: '旅人' }, narrativeMode: 'world', displayMode: 'ui', stateTracking: true,
        api: { type: 'lmstudio', route: 'local', protocol: 'openai', model: 'mock', baseUrl: 'http://localhost:1234/v1', key: 'BAO_LOCAL_NO_AUTH', maxOutputTokens: 4096 },
        memory: { mode: 'rounds', maxRounds: 20, maxContext: 64000, cache: false }, cost: { stateApiMode: 'same' } };
      Chat.reset(); GameState.create(App.activeCharacter, App.config);
      Chat.add('user', '離開展會'); Chat.add('assistant', '下午四點，你和鳴海征已到車旁。他換上外套，契約剩三天，兩人已正式交往。');
      GameState.current.time = '15:30'; GameState.current.location = '舊展會';
      Object.assign(GameState.current.modules.lover, { name: '鳴海征', mood: '舊情緒', action: '展會接待' });
      GameState.current.modules.contract.remaining_time = '一週';
      GameState.current.modules.scene.atmosphere = '舊場景';
      GameState.current.modules.player_notes = { text: '玩家手動內容' };
      window.__repairCalls = [];
      const original = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = String(input?.url || input);
        if (!url.startsWith('http://localhost:1234/v1')) return original(input, init);
        const body = JSON.parse(init.body); window.__repairCalls.push(body);
        const text = JSON.stringify({ time: '16:00', location: '車旁', npcs: [], character_statuses: {}, modules: {
          lover: { mood: '放鬆', action: '換上外套', visible_clues: ['他換上外套'] }, contract: { remaining_time: '三天' }, scene: { atmosphere: '安靜', present_npcs: ['旅人', '鳴海征'] },
          relationship: { stage: '正式交往', shared_events: ['離開展會'] }, player_notes: { text: '模型不得覆寫' }
        } });
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }));
      };
      App.renderChatShell(false); App.showView('chat');
    });
    for (const id of ['lover', 'contract', 'relationship', 'scene']) {
      await expect(page.locator(`#game-ui .ui-tabs > [data-panel="${id}"]`)).toHaveCount(1);
      await expect(page.locator(`#game-ui .ui-tabs > [data-panel="module:${id}"]`)).toHaveCount(0);
    }
    await expect(page.locator('#game-ui .ui-tabs > [data-panel="module:client"]')).toHaveCount(1);
    // Player-only data missing from the authored view needs its generic entry.
    await page.evaluate(() => { GameState.current.modules.lover.player_extra = '額外資料'; App.renderChatShell(false); });
    await expect(page.locator('#game-ui .ui-tabs > [data-panel="module:lover"]')).toHaveCount(1);
    await page.evaluate(() => {
      delete GameState.current.modules.lover.player_extra;
      window.__authoredCard = App.activeCharacter;
      App.activeCharacter = { ...App.activeCharacter, gameplay_ui: null, gameplay: { ...App.activeCharacter.gameplay, gameplay_ui: null } };
      App.renderChatShell(false);
    });
    await expect(page.locator('#game-ui .ui-tabs > [data-panel="module:contract"]')).toHaveCount(1);
    await page.evaluate(() => { App.activeCharacter = window.__authoredCard; App.renderChatShell(false); BAOContextHealth.open(); });
    await expect(page.locator('#game-ui .ui-tabs > [data-panel="module:lover"]')).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: '上下文狀態' });
    await expect(dialog).toContainText('不必先手動存檔');
    expect(await page.evaluate(() => Storage.loadStory()?.state.location)).not.toBe('舊展會');
    page.once('dialog', d => d.accept());
    await dialog.locator('[data-state-rebuild="recent"]').click();
    await expect(dialog.locator('[data-state-rebuild-result]')).toContainText('已處理作品資料');
    await expect(dialog.locator('[data-state-rebuild-result]')).toContainText('尚未確認同步');
    const data = await page.evaluate(() => ({
      current: GameState.current.modules, report: GameState.current.stateRebuildReport,
      saved: Storage.loadStory().state.modules, calls: window.__repairCalls,
      prose: Chat.messages.at(-1).content
    }));
    expect(data.current.lover.action).toBe('換上外套');
    expect(data.current.contract.remaining_time).toBe('三天');
    expect(data.current.relationship.stage).toBe('正式交往');
    expect(data.current.scene.atmosphere).toBe('安靜');
    expect(data.current.scene.present_npcs).toEqual(['旅人', '鳴海征']);
    expect(data.current.lover.visible_clues).toEqual(['他換上外套']);
    expect(data.current.relationship.shared_events).toEqual(['離開展會']);
    expect(data.current.player_notes.text).toBe('玩家手動內容');
    expect(data.saved).toEqual(data.current);
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].max_tokens ?? data.calls[0].max_completion_tokens).toBe(4096);
    expect(data.report.unconfirmed).toEqual(expect.arrayContaining(['妳', '訂製條件']));
    expect(data.prose).toContain('下午四點');
    await page.screenshot({ path: testInfo.outputPath(`rebuild-${width}.png`) });
    await page.reload();
    await page.waitForFunction(() => window.BAOContextHealth && Storage.status().ready && App.characters?.length);
    expect(await page.evaluate(() => { Storage.restoreStory(Storage.loadStory()); App.renderChatShell(false); return GameState.current.modules.contract.remaining_time; })).toBe('三天');
    await expect(page.locator('#game-ui .ui-tabs > [data-panel="module:contract"]')).toHaveCount(0);
  });
}

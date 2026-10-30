const { test, expect } = require('@playwright/test');

for (const width of [390, 1440]) {
  test(`merged state follows each story turn and survives reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.BAOSameModelStateMerge && window.BAOChatExperienceRepairs && App.characters.length);
    await page.evaluate(() => {
      window.__mergedCalls = [];
      const original = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = String(input?.url || input);
        if (!url.startsWith('http://localhost:1234/v1/')) return original(input, init);
        const body = JSON.parse(init.body);
        window.__mergedCalls.push(body);
        const index = window.__mergedCalls.length;
        const patch = index === 1 ? { location: '咖啡館', events: ['第一次見面'] }
          : index === 2 ? { location: '車站', events: ['一起離開咖啡館'] }
            : index === 4 ? { time: '午夜', location: '咖啡館' } : {};
        // Fourth turn deliberately conflicts with the explicitly confirmed
        // scene in the visible story; the helper PATCH must not rewind it.
        const prose = index === 4
          ? '第4輪故事。\n當前場景資訊\n時間：凌晨三點\n地點：港口\n'
          : `第${index}輪故事。`;
        const text = `${prose}<BAO_STATE>${JSON.stringify(patch)}</BAO_STATE>`;
        if (body.stream) {
          const encoder = new TextEncoder();
          const chunks = [text.slice(0, 9), text.slice(9, 15), text.slice(15)];
          return Promise.resolve(new Response(new ReadableStream({
            start(controller) {
              chunks.forEach(content => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }), { headers: { 'Content-Type': 'text/event-stream' } }));
        }
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }),
          { headers: { 'Content-Type': 'application/json' } }));
      };
      App.activeCharacter = { ...App.characters[0], id: 'merged-state-test', name: '測試角色', greeting: '開場。', world_modules: [] };
      App.config = {
        narrativeMode: 'world', displayMode: 'ui', stateTracking: true,
        persona: { name: '玩家' }, memory: { mode: 'rounds', maxRounds: 10, cache: false },
        cost: { stateInterval: 20, stateApiMode: 'same' },
        api: { type: 'lmstudio', protocol: 'openai', model: 'mock-local', baseUrl: 'http://localhost:1234/v1', key: 'BAO_LOCAL_NO_AUTH', route: 'local' }
      };
      Chat.reset();
      GameState.create(App.activeCharacter, App.config);
      App.renderChatShell(true);
      App.showView('chat');
    });
    for (let index = 1; index <= 4; index++) {
      await page.locator('#user-input').fill(`玩家行動${index}`);
      await page.evaluate(() => App.sendMessage());
      await expect.poll(() => page.evaluate(() => GameState.current.stateTracker?.phase)).toBe(index === 3 ? 'unchanged' : 'updated');
      await expect(page.locator('#chat-stream')).toContainText(`第${index}輪故事。`);
      const state = await page.evaluate(() => ({
        calls: window.__mergedCalls.length, location: GameState.current.location,
        pending: GameState.current.pendingStateTurns.length,
        messages: Chat.messages.map(m => m.content),
        contract: window.__mergedCalls.at(-1).messages.at(-1).content.includes('BAO_STATE_V1')
      }));
      expect(state.calls).toBe(index);
      expect(state.location).toBe(index === 1 ? '咖啡館' : index === 4 ? '港口' : '車站');
      expect(state.pending).toBe(0);
      expect(state.contract).toBe(true);
      expect(state.messages.join('')).not.toContain('BAO_STATE');
      await expect(page.locator('#chat-stream')).not.toContainText('BAO_STATE');
    }
    await page.evaluate(async () => { App.saveStory(false); await Storage.flush(); });
    await page.reload();
    await page.waitForFunction(() => window.BAOSameModelStateMerge && Storage.status().ready && App.characters.length);
    expect(await page.evaluate(() => {
      const saved = Storage.loadStory();
      const ok = Storage.restoreStory(saved);
      return { ok, location: GameState.current.location, time: GameState.current.time, events: GameState.current.events, pending: GameState.current.pendingStateTurns.length };
    })).toMatchObject({ ok: true, location: '港口', time: '凌晨三點', pending: 0, events: expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String), text: '第一次見面', source: 'state-model', turn: 1 }),
      expect.objectContaining({ id: expect.any(String), text: '一起離開咖啡館', source: 'state-model', turn: 2 })
    ]) });
  });
}

test('Gemini merged state crosses the first smart-summary boundary with a large roster', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.BAOSameModelStateMerge && window.BAOChatExperienceRepairs && App.characters.length);
  await page.evaluate(() => {
    window.__geminiCalls = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = String(input?.url || input);
      if (!url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')) return original(input, init);
      const body = JSON.parse(init.body);
      const memory = Boolean(body.generationConfig?.responseFormat);
      const turn = 22 + window.__geminiCalls.filter(call => !call.memory).length;
      window.__geminiCalls.push({ memory, body });
      const text = memory ? JSON.stringify({ events: ['已離開展會'], knownFacts: ['目前在車旁'], relationships: [], openThreads: [] })
        : turn === 22 || turn === 24 ? `第${turn}輪故事。`
          : `第${turn}輪故事。<BAO_STATE>{"location":"車旁${turn}","time":"週三 16:${turn}"}</BAO_STATE>`;
      const finishReason = !memory && turn === 23 ? 'MAX_TOKENS' : !memory && turn === 24 ? 'SAFETY' : 'STOP';
      const event = { candidates: [{ content: { parts: [{ text }] }, finishReason }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 50, totalTokenCount: 1050 } };
      return Promise.resolve(new Response(url.includes('alt=sse') ? `data: ${JSON.stringify(event)}\n\n` : JSON.stringify(event),
        { headers: { 'Content-Type': url.includes('alt=sse') ? 'text/event-stream' : 'application/json' } }));
    };
    App.activeCharacter = { ...App.characters[0], id: 'gemini-long-story-test', name: '測試角色', greeting: '', world_modules: [] };
    App.config = {
      narrativeMode: 'world', displayMode: 'ui', stateTracking: true, persona: { name: '玩家' },
      memory: { mode: 'smart', maxRounds: 20, summaryInterval: 4, maxContext: 1000000, cache: false, summaryApiMode: 'same' },
      cost: { stateApiMode: 'same' },
      api: { type: 'gemini', protocol: 'gemini', model: 'gemini-3.1-pro-preview', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models', key: 'mock-key' }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    for (let i = 1; i <= 21; i++) { Chat.add('user', `先前行動${i}`); Chat.add('assistant', `先前故事${i}`); }
    GameState.current.npcs = Array.from({ length: 30 }, (_, i) => ({ npc_id: `npc-${i}`, name: `人物${i}`, appearance: '人物固定外觀'.repeat(180), presence: 'away' }));
    App.renderChatShell(true); App.showView('chat');
  });
  for (let turn = 22; turn <= 28; turn++) {
    await page.locator('#user-input').fill(`繼續故事${turn}`);
    await page.evaluate(() => App.sendMessage());
    const result = await page.evaluate(() => ({
      phase: GameState.current.stateTracker?.phase, diagnostic: GameState.current.stateTracker?.diagnostic,
      meta: GameState.current.stateRequestDiagnostics, location: GameState.current.location,
      calls: window.__geminiCalls, summary: Chat.summary, cursor: Chat.summarizedUntil,
      pending: GameState.current.pendingStateTurns.length, text: Chat.messages.at(-1).content
    }));
    expect(result.calls.filter(call => !call.memory)).toHaveLength(turn - 21);
    expect(result.text).toBe(`第${turn}輪故事。`);
    expect(result.diagnostic).toBe(turn === 22 ? 'missing_appendix' : turn === 23 ? 'output_truncated' : turn === 24 ? 'provider_blocked' : '');
    expect(result.meta.applied).toBe(turn >= 25);
    if (turn >= 25) { expect(result.location).toBe(`車旁${turn}`); expect(result.pending).toBe(0); }
    for (const call of result.calls.filter(call => !call.memory)) {
      const prompt = call.body.contents.at(-1).parts[0].text;
      const json = prompt.split('【目前狀態】\n')[1].split('\n\n【可更新世界模組】')[0];
      expect(json.length).toBeLessThanOrEqual(12000);
      expect(JSON.parse(json).npcs).toHaveLength(30);
    }
    if (turn === 24) { expect(result.summary).toContain('已離開展會'); expect(result.cursor).toBeGreaterThan(0); }
  }
  await expect(page.locator('#chat-stream')).not.toContainText('BAO_STATE');
});

for (const width of [390, 1440]) {
  test(`all story pages track money and consumed items in prose mode at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.BAOSameModelStateMerge && window.BAOChatExperienceRepairs && App.characters.length);
    await page.evaluate(() => {
      window.__ledgerCalls = [];
      const original = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        if (!String(input?.url || input).startsWith('http://localhost:1234/v1/')) return original(input, init);
        const body = JSON.parse(init.body); window.__ledgerCalls.push(body);
        const index = window.__ledgerCalls.length;
        const checks = { economy: index === 1 ? ['currency'] : ['gold', 'currency'], inventory: true,
          ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`page${i}`, ['value']])) };
        const patch = index === 1 ? { time: '中午', location: '城門', modules: { economy: { gold: 80 }, inventory: [{ id: 'bread', name: '麵包', quantity: 1 }] }, module_checks: checks }
          : index === 2 ? { scene_checks: ['time', 'location'], modules: {}, module_removals: { inventory: [{ id: 'potion', evidence: '你喝完最後一瓶藥水。' }] }, module_checks: checks }
            : { location: '旅館', modules: { economy: { gold: 0 } } };
        const prose = index === 1 ? '花費二十金幣後，餘額八十。你取得麵包，已到城門。' : index === 2 ? '你喝完最後一瓶藥水。' : '晚上，你已經到旅館。';
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: prose + '<BAO_STATE>' + JSON.stringify(patch) + '</BAO_STATE>' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }));
      };
      App.activeCharacter = { ...App.characters[0], id: 'ledger-test', name: '測試角色', greeting: '出發。', world_modules: [
        { id: 'economy', label: '資產', kind: 'object', tracking: 'medium', fields: [{ key: 'gold', type: 'number' }, { key: 'currency', type: 'text' }] },
        { id: 'inventory', label: '背包', kind: 'collection', tracking: 'low', context: 'ui_only', fields: [{ key: 'id', type: 'text' }, { key: 'name', type: 'text' }, { key: 'quantity', type: 'number' }] },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `page${i}`, label: `分頁${i}`, kind: 'object', tracking: 'low', context: 'ui_only', fields: [{ key: 'value', type: 'text' }] }))
      ] };
      App.config = { narrativeMode: 'immersive', displayMode: 'text', stateTracking: false, persona: { name: '旅人' }, memory: { mode: 'rounds', maxRounds: 10, cache: false }, cost: { stateApiMode: 'same' }, api: { type: 'lmstudio', route: 'local', protocol: 'openai', model: 'mock', baseUrl: 'http://localhost:1234/v1', key: 'BAO_LOCAL_NO_AUTH' } };
      Chat.reset(); GameState.create(App.activeCharacter, App.config);
      GameState.current.modules.economy = { gold: 100, currency: '金幣' };
      GameState.current.modules.inventory = [{ id: 'potion', name: '藥水', quantity: 1 }, { id: 'key', name: '鑰匙', quantity: 1 }];
      for (let i = 0; i < 10; i++) GameState.current.modules[`page${i}`] = { value: '原值' };
      App.renderChatShell(true); App.showView('chat');
    });
    for (let index = 1; index <= 3; index++) {
      await page.locator('#user-input').fill(index === 1 ? '繼續' : index === 2 ? '喝藥水' : '去旅館');
      await page.evaluate(() => App.sendMessage());
      await expect.poll(() => page.evaluate(() => GameState.current.stateTracker?.phase)).toBe(index === 3 ? 'partial' : 'updated');
      expect(await page.evaluate(() => window.__ledgerCalls.length)).toBe(index);
    }
    const result = await page.evaluate(async () => {
      App.saveStory(false); await Storage.flush();
      const request = window.__ledgerCalls[0].messages.at(-1).content;
      return { request, state: GameState.current };
    });
    expect(result.request).toContain('"page9"');
    expect(result.state.modules.economy.gold).toBe(0);
    expect(result.state.modules.inventory.map(i => i.id)).toEqual(['key', 'bread']);
    expect(result.state.pendingStateTurns).toHaveLength(1);
    await page.reload();
    await page.waitForFunction(() => window.BAOSameModelStateMerge && Storage.status().ready && App.characters.length);
    expect(await page.evaluate(() => {
      Storage.restoreStory(Storage.loadStory());
      return { gold: GameState.current.modules.economy.gold, items: GameState.current.modules.inventory.map(i => i.id), phase: GameState.current.stateTracker.phase, pending: GameState.current.pendingStateTurns.length };
    })).toEqual({ gold: 0, items: ['key', 'bread'], phase: 'partial', pending: 1 });
  });
}

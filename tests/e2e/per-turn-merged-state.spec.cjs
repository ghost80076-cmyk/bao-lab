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
          : index === 2 ? { location: '車站', events: ['一起離開咖啡館'] } : {};
        const text = `第${index}輪故事。<BAO_STATE>${JSON.stringify(patch)}</BAO_STATE>`;
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
    for (let index = 1; index <= 3; index++) {
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
      expect(state.location).toBe(index === 1 ? '咖啡館' : '車站');
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
      return { ok, location: GameState.current.location, events: GameState.current.events, pending: GameState.current.pendingStateTurns.length };
    })).toMatchObject({ ok: true, location: '車站', pending: 0, events: expect.arrayContaining(['第一次見面', '一起離開咖啡館']) });
  });
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function runtime() {
  const values = new Map();
  const context = {
    console, setTimeout, clearTimeout, AbortController,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
    addEventListener() {},
    document: { readyState: 'loading', head: { appendChild() {} }, createElement: () => ({}),
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    Chat: { messages: [], context: async () => [{ role: 'user', content: '最新行動' }] },
    API: {}, GameState: { current: { storySessionId: 'unchanged-session' } },
    App: { activeCharacter: { name: '測試角色' }, config: { persona: { name: '玩家' }, memory: { cache: true } },
      escapeHTML: String, buildSystemPrompt: () => 'AUTHOR ORIGINAL',
      openBuilder() {}, collectConfig: () => ({}), startStory() {}, sendMessage() {}, renderChatShell() {} }
  };
  context.window = context;
  vm.createContext(context);
  const run = file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  run('js/player-settings.js');
  return { context, run, values };
}
const globalLines = {
  short: '使用精簡回覆，優先快速對話與劇情推進，通常約 300～600 個中文字；不要為縮短而省略理解本輪所需的關鍵動作或結果。',
  long: '使用完整場景回覆，充分描寫動作、環境、角色反應與因果，通常約 900～1500 個中文字；不要為達字數而重複、灌水或拖慢劇情。',
  auto: '依場景密度自動調整篇幅：日常對話可以簡潔；戰鬥、重大轉折、關係變化或需要沉浸描寫的場景可以加長。不要硬湊固定字數。'
};

(async () => {
  const { context: c, run, values } = runtime();
  // Record the real legacy player prompt before installing the narrative layer.
  const legacy = {};
  for (const choice of Object.keys(globalLines)) {
    c.BAOPlayerSettings.set({ replyLength: choice });
    legacy[choice] = c.App.buildSystemPrompt();
  }
  run('js/narrative-settings.js');
  run('js/prompt-cache.js');
  run('js/prompt-orchestrator.js');
  for (const choice of Object.keys(globalLines)) {
    c.BAOPlayerSettings.set({ replyLength: choice });
    for (const raw of [undefined, {}, { responseLength: 'card' }, { responseLength: 'invalid' }]) {
      c.BAONarrativeSettings.set({});
      if (raw === undefined) delete c.App.config.narrative;
      else c.App.config.narrative = raw;
      assert.equal(c.App.buildSystemPrompt(), legacy[choice], 'unaffected/legacy stories keep the exact original prompt');
    }
    for (const length of ['short', 'medium', 'long']) {
      c.App.config.narrative = { responseLength: length, stylePacks: ['natural'], pacing: 'slow' };
      const before = JSON.stringify([c.App.config, c.GameState.current, [...values]]);
      const prompt = c.App.buildSystemPrompt();
      assert.ok(prompt.startsWith(legacy[choice].replace(globalLines[choice] + '\n', '')),
        'remove only the superseded player length line, preserving author/POV/dialogue/language text');
      assert.equal((prompt.match(/每輪通常以約/g) || []).length, 1);
      for (const line of Object.values(globalLines)) assert.ok(!prompt.includes(line));
      assert.ok(prompt.includes('語言與對白保持自然口語'));
      assert.equal(JSON.stringify([c.App.config, c.GameState.current, [...values]]), before, 'building requests never migrates saved settings');
    }
  }
  // Changing an unused default must not alter the final cacheable request.
  c.App.config.narrative = { responseLength: 'long' };
  c.BAOPlayerSettings.set({ replyLength: 'short' });
  const first = await c.App.buildMessages(c.App.config);
  c.BAOPlayerSettings.set({ replyLength: 'auto' });
  assert.equal(JSON.stringify(await c.App.buildMessages(c.App.config)), JSON.stringify(first));
  // Switching stories immediately restores the existing browser fallback.
  c.App.config.narrative = { responseLength: 'card' };
  assert.ok(c.App.buildSystemPrompt().includes(globalLines.auto));
  // Missing narrative on a legacy story already falls back to browser narrative defaults.
  delete c.App.config.narrative;
  c.BAONarrativeSettings.set({ responseLength: 'medium' });
  assert.ok(!c.App.buildSystemPrompt().includes(globalLines.auto));
  assert.equal((c.App.buildSystemPrompt().match(/每輪通常以約/g) || []).length, 1);
  // A mixed-cache page with an old narrative script retains the safe legacy behavior.
  delete c.BAONarrativeSettings.hasExplicitResponseLength;
  assert.ok(c.App.buildSystemPrompt().includes(globalLines.auto));
  console.log('reply length precedence: legacy parity, one effective instruction, story switching and stable request passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

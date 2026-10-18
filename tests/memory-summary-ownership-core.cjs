'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
function setup(guarded = false) {
  const calls = [], notice = { title: '', dataset: {} };
  const ctx = vm.createContext({ console: { warn() {} }, Date, AbortController, setTimeout, clearTimeout, addEventListener() {},
    document: { getElementById: id => id === 'usage-guard' ? notice : null },
    GameState: { current: { memory: [] } },
    App: { config: {}, buildSystemPrompt: () => '' },
    BAOHelperData: { memoryRules: '', parse: () => ({}), memoryText: text => text === 'GOOD' ? 'summary' : '' },
    BAOEpisodicMemory: { updateContext: () => ({}), ingest: owner => { owner.ingested = true; } },
    API: { send(config) { return new Promise((resolve, reject) => calls.push({ config, resolve, reject })); } }
  });
  ctx.window = ctx;
  vm.runInContext(read('chat.js') + '\nglobalThis.Chat = Chat;', ctx);
  if (guarded) vm.runInContext(read('prompt-cache.js'), ctx);
  const seed = () => {
    ctx.Chat.reset();
    ctx.Chat.messages = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `text${i}` }));
  };
  seed();
  const config = { api: { key: 'mock', model: 'mock' }, memory: { mode: 'smart', maxRounds: 4, summaryInterval: 2 } };
  return { ctx, calls, notice, seed, run: () => ctx.Chat.maybeSummarize(config) };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
(async () => {
  for (const guarded of [false, true]) {
    for (const outcome of ['GOOD', '', 'malformed', 'reject']) {
      const { ctx, calls, notice, seed, run } = setup(guarded);
      const oldOwner = ctx.GameState.current;
      const old = run();
      ctx.GameState.current = { memory: [] };
      seed();
      const current = run();
      const health = ctx.Chat.memoryHealth;
      notice.title = 'current story notice';
      if (outcome === 'reject') calls[0].reject(new Error('quota'));
      else calls[0].resolve({ text: outcome });
      await old;
      assert.equal(ctx.Chat.memoryHealth, health, `stale ${outcome} cannot change current health (guard=${guarded})`);
      assert.equal(ctx.Chat.summarizing, true, 'old finally cannot unlock the current summary');
      assert.equal(ctx.Chat.summary, '');
      assert.equal(oldOwner.ingested, undefined);
      assert.equal(calls.length, 2, 'stale malformed output must not launch a repair');
      assert.equal(notice.title, 'current story notice');
      await run();
      assert.equal(calls.length, 2, 'current task remains deduplicated');
      calls[1].resolve({ text: 'GOOD' });
      await current;
      assert.equal(ctx.Chat.summary, 'summary');
      assert.equal(ctx.Chat.memoryHealth.phase, 'success');
      assert.equal(ctx.Chat.summarizing, false);
      assert.equal(ctx.GameState.current.ingested, true);
    }
    const { ctx, calls, seed, run } = setup(guarded);
    const pending = run();
    calls[0].resolve({ text: 'malformed' });
    await flush();
    assert.equal(calls.length, 2, 'active malformed result still gets one repair');
    ctx.GameState.current = { memory: [] };
    seed();
    const health = ctx.Chat.memoryHealth;
    calls[1].resolve({ text: '' });
    await pending;
    assert.equal(ctx.Chat.memoryHealth, health, 'late repair failure cannot overwrite the new story');
  }
  for (const mutate of [ctx => ctx.Chat.messages[0].content = 'edited', ctx => ctx.Chat.reset()]) {
    const { ctx, calls, run } = setup();
    const pending = run();
    mutate(ctx);
    const health = ctx.Chat.memoryHealth;
    calls[0].resolve({ text: '' });
    await pending;
    assert.equal(ctx.Chat.memoryHealth, health, 'invalidated source/reset cannot publish stale failure');
    assert.equal(ctx.Chat.summarizing, false);
  }
  console.log('memory summary ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

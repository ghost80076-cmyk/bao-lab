'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(shared = true, modular = false) {
  let response = { text: '{"location":"新場景"}', finishReason: 'STOP' };
  let release, submitted;
  const sandbox = { console: { warn() {} },
    Chat: { messages: [{ role: 'assistant', content: '來源正文' }] },
    API: { send: async (_config, messages) => { submitted = messages; return typeof response === 'function' ? response() : response; } },
    BAOHelperData: { stateUpdate: data => data, moduleSchemas: () => [], characterCoverage: () => [], moduleCoverage: () => [], sceneCoverage: () => [] },
    GameState: { create() {}, current: { location: '原場景' }, applyUpdate(data) { Object.assign(this.current, data); } }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  if (shared) vm.runInContext(fs.readFileSync('js/memory-core.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/world-state.js', 'utf8') + '\nwindow.engine = WorldStateEngine;', ctx);
  if (modular) vm.runInContext(fs.readFileSync('js/world-modules.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/world-state-cost.js', 'utf8'), ctx);
  const config = { narrativeMode: 'world', api: { key: 'mock', model: 'state' }, cost: { stateInterval: 1 } };
  ctx.App = { config };
  return { ctx, config, submitted: () => submitted, update: () => ctx.engine.update(config, '玩家', '故事'),
    reply(value) { response = value; },
    delay() { response = () => new Promise(resolve => { release = resolve; }); },
    finish() { release({ text: '{"location":"過期場景"}', finishReason: 'STOP' }); } };
}

(async () => {
  // Real base engine plus queue wrapper: valid JSON does not prove completion.
  for (const modular of [false, true]) {
    for (const shared of [true, false]) {
      for (const reason of ['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS', 'MAX_COMPLETION_TOKENS', 'SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'CONTENT_FILTER']) {
        const f = fixture(shared, modular);
        f.reply({ text: '{"location":"不完整場景"}', finishReason: reason });
        assert.equal(await f.update(), null, reason);
        assert.equal(f.ctx.GameState.current.location, '原場景', reason);
        assert.equal(f.ctx.GameState.current.pendingStateTurns.length, 1, 'failed evidence stays pending');
        assert.equal(f.ctx.GameState.current.stateTracker.phase, 'failed');
        if (shared) assert.match(f.submitted()[0].content, /虛構劇情資料統整/);
        f.reply({ text: '{"location":"新場景"}', finishReason: 'STOP' });
        await f.update();
        assert.equal(f.ctx.GameState.current.location, '新場景');
        assert.equal(f.ctx.GameState.current.pendingStateTurns.length, 1, 'only successful batch is removed');
      }
    }
    for (const change of ['owner', 'history', 'config', 'replace-config']) {
      const f = fixture(true, modular), owner = f.ctx.GameState.current;
      f.delay();
      const work = f.update();
      if (change === 'owner') f.ctx.GameState.current = { location: '別的故事' };
      if (change === 'history') f.ctx.Chat.messages[0].content = '回溯或修訂過的來源';
      if (change === 'config') f.config.api.model = 'new-model';
      if (change === 'replace-config') f.ctx.App.config = structuredClone(f.config);
      f.finish();
      assert.equal(await work, null, change);
      assert.equal(owner.location, '原場景', change);
      assert.equal(owner.pendingStateTurns.length, 1, change);
      if (change === 'owner') {
        assert.equal(f.ctx.GameState.current.location, '別的故事');
        assert.equal(f.ctx.GameState.current.stateRequestDiagnostics, undefined);
      }
    }
  }
  console.log('State completion: truncated/blocked JSON rejected, pending evidence retained, successful retry and stale owner/history/config protected');
})().catch(error => { console.error(error); process.exitCode = 1; });

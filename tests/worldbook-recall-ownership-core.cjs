'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../js/worldbook-library-core.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/worldbook-library.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function check(stage, change) {
  const inner = deferred(), catalog = deferred();
  const messages = [{ role: 'system', content: 'stable prefix' }, { role: 'user', content: 'player' }];
  const pack = { schema: core.SCHEMA, version: 1, meta: { id: 'test-lore', name: 'Test lore', world: 'general' },
    entries: [{ id: 'rule', mode: 'constant', content: 'original lore' }] };
  const state = { worldbookLibrary: { version: 1, enabled: ['test-lore'], installed: stage === 'catalog' ? [] : [pack], pinned: {} } };
  const ctx = vm.createContext({ console, MutationObserver: class { observe() {} }, GameState: { current: state }, Chat: { messages: [{ role: 'user', content: 'player' }] },
    YoruWorldbookLibraryCore: core,
    App: { buildMessages: () => inner.promise,
      wrapBuildMessages(id, wrapper) { const next = this.buildMessages.bind(this); this.buildMessages = (...args) => wrapper(next, ...args); } },
    document: { querySelector: () => null, createElement: () => ({}), head: { appendChild() {} } },
    fetch: () => catalog.promise
  });
  ctx.window = ctx;
  vm.runInContext(source, ctx);
  const pending = ctx.App.buildMessages({});
  if (stage === 'catalog') {
    inner.resolve(messages);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  if (change === 'story') ctx.GameState.current = { worldbookLibrary: { version: 1, enabled: ['test-lore'], installed: [pack], pinned: {} } };
  if (change === 'settings') state.worldbookLibrary = { version: 1, enabled: [], installed: [], pinned: {} };
  inner.resolve(messages);
  catalog.resolve({ ok: true, json: async () => ({ packs: [pack] }) });
  const result = await pending;
  if (change === 'none') {
    assert.match(result[0].content, /original lore/);
    assert.equal(messages[0].content, 'stable prefix', 'worldbook recall preserves source prompt');
  } else assert.equal(result, messages, `${stage}/${change}: stale worldbook assembly stays unaugmented`);
}
(async () => {
  for (const stage of ['inner', 'catalog']) await check(stage, 'story');
  await check('catalog', 'settings');
  await check('inner', 'none');
  console.log('worldbook recall ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

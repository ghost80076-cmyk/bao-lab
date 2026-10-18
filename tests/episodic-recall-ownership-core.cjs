'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/episodic-memory.js'), 'utf8');
function setup(memory = {}) {
  let complete, recallCalls = 0;
  const pending = new Promise(resolve => { complete = resolve; });
  const messages = [{ role: 'system', content: 'stable prefix' }, { role: 'user', content: 'original player' }];
  const ctx = vm.createContext({
    App: { config: { memory }, activeCharacter: { name: 'original actor' },
      buildMessages: () => pending,
      wrapBuildMessages(id, wrapper) {
        const next = this.buildMessages.bind(this);
        this.buildMessages = (...args) => wrapper.call(this, next, ...args);
      } },
    Chat: { messages: [{ id: 'u', role: 'user', content: 'original player' }] },
    GameState: { current: { secret: 'original memory' } },
    BAOEpisodicMemory: { audience: ({ primary }) => [primary], recall({ state, input, actors }) {
      recallCalls++;
      return [{ block: state.secret + '|' + input + '|' + actors.join(',') }];
    } }
  });
  ctx.window = ctx;
  vm.runInContext(source, ctx);
  return { ctx, messages, complete, calls: () => recallCalls };
}
(async () => {
  for (const change of ['story', 'history', 'semantic', 'actor', 'actor-name', 'config']) {
    const { ctx, complete, messages, calls } = setup();
    const pending = ctx.App.buildMessages(ctx.App.config);
    if (change === 'story') ctx.GameState.current = { secret: 'OTHER STORY SECRET' };
    if (change === 'history') ctx.Chat.messages[0].content = 'edited branch';
    if (change === 'semantic') ctx.Chat.messages[0].context_content = 'edited semantic source';
    if (change === 'actor') ctx.App.activeCharacter = { name: 'other actor' };
    if (change === 'actor-name') ctx.App.activeCharacter.name = 'renamed actor';
    if (change === 'config') ctx.App.config = { memory: {} };
    complete(messages);
    assert.equal(await pending, messages, `${change}: obsolete assembly stays unaugmented`);
    assert.equal(calls(), 0, `${change}: cannot recall against a different context`);
  }
  for (const memory of [{ episodicRecall: false }, { mode: 'full' }]) {
    const { ctx, complete, messages, calls } = setup(memory);
    const pending = ctx.App.buildMessages(ctx.App.config);
    complete(messages);
    assert.equal(await pending, messages);
    assert.equal(calls(), 0, 'disabled/full-history mode retains zero recall calls');
  }
  const { ctx, complete, messages, calls } = setup();
  const pending = ctx.App.buildMessages(ctx.App.config);
  ctx.Chat.messages = ctx.Chat.messages.map(message => ({ ...message }));
  complete(messages);
  const result = await pending;
  assert.equal(calls(), 1);
  assert.equal(result[0], messages[0], 'stable prefix retains identity/content');
  assert.match(result[1].content, /original memory\|original player\|original actor/);
  assert.equal(messages[1].content, 'original player', 'recall never mutates the underlying assembled prompt');
  console.log('episodic recall ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

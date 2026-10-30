'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const gate = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function runtime() {
  const ctx = vm.createContext({ structuredClone, console: { warn() {} },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: id => id === 'user-input' ? ctx.input : null,
      createElement: () => ({}), head: { appendChild() {} } },
    Storage: { clone: structuredClone, scrubSecrets: structuredClone },
    Chat: { messages: [{ id: 'u', role: 'user', content: 'player' }, { id: 'a', role: 'assistant', content: 'old',
      revisionBase: { state: { location: 'base' }, summary: '' } }], add() {}, afterTurn() {} },
    GameState: { current: { location: 'current', selection: ['A'] } }, API: { async send() {} },
    App: { config: {}, activeCharacter: { id: 'hero' }, saveStory() { ctx.saves++; }, buildSystemPrompt: () => '',
      renderUIPanel() {}, renderChatShell() {}, openBuilder() {}, async sendMessage(...args) { ctx.sends.push(args); return 'sent'; },
      wrapSendMessage(id, wrapper) { const next = this.sendMessage.bind(this); this.sendMessage = (...args) => wrapper.call(this, next, ...args); } },
    BAOCharacterStatus: { selectedContextCharacters: () => ctx.GameState.current.selection || [],
      clearContextCharacters() { ctx.GameState.current.selection = []; } },
    setTimeout() {}, input: { value: 'draft' }, saves: 0, sends: []
  });
  ctx.window = ctx;
  return ctx;
}
(async () => {
  for (const receiptMode of [false, true]) for (const change of ['story', 'selection', 'normal', ...(receiptMode ? ['invalid-receipt', 'no-receipt'] : [])]) {
    const c = runtime(), g = gate();
    let received;
    c.App.sendMessage = (...args) => { received = args; return g.promise; };
    if (!receiptMode) delete c.App.wrapSendMessage;
    c.App.storyTurnReceipts = receiptMode;
    vm.runInContext(read('character-status-ui.js'), c);
    const pending = c.App.sendMessage('arg');
    if (change === 'story') c.GameState.current = { location: 'B', selection: ['B'] };
    if (change === 'selection') c.GameState.current.selection = ['B'];
    c.Chat.messages.push({ id: 'later', role: 'assistant', content: 'reply' });
    const result = receiptMode && change !== 'no-receipt' ? { kind: 'bao:story-turn', isCurrent: () => change !== 'invalid-receipt' } : 'result';
    g.resolve(result);
    assert.equal(await pending, result);
    assert.equal(received[0], 'arg');
    assert.equal(JSON.stringify(c.GameState.current.selection), change === 'normal' ? '[]' : ['story','selection'].includes(change) ? '["B"]' : '["A"]');
    assert.equal(c.saves, change === 'normal' ? 1 : 0);
  }
  for (const change of ['story', 'draft', 'normal']) {
    const c = runtime(), g = gate();
    c.WorldStateEngine = { update: () => g.promise };
    vm.runInContext(read('story-revision-state.js'), c);
    c.Chat.messages[1].content = 'revised';
    c.App.saveStory(false);
    const pending = c.App.sendMessage('arg');
    await flush();
    if (change === 'story') { c.GameState.current = { location: 'B' }; c.Chat.messages = []; }
    if (change === 'draft') c.input.value = 'new draft';
    const before = c.saves;
    g.resolve({});
    await pending;
    assert.equal(c.sends.length, change === 'normal' ? 1 : 0, 'stale queued send cannot consume current draft');
    if (change === 'story') assert.equal(c.saves, before, 'stale reconciliation cannot save new story');
    if (change === 'normal') assert.equal(c.sends[0][0], 'arg');
  }
  {
    const c = runtime();
    let updates = 0; c.WorldStateEngine = { async update() { updates++; } };
    vm.runInContext(read('story-revision-state.js'), c);
    c.Chat.messages[1].content = 'revised'; c.App.saveStory(false);
    c.GameState.current = { location: 'B' }; c.Chat.messages = [];
    await c.BAOStoryRevisionState.whenIdle();
    assert.equal(updates, 0, 'old queued reconcile cannot begin after story switch');
    assert.equal(c.GameState.current.location, 'B');
  }
  {
    const c = runtime(), g = gate();
    c.API.send = () => g.promise;
    vm.runInContext(read('story-revision-state.js'), c);
    const pending = c.API.send({ __storyTool: true }, [{ role: 'system', content: 'prompt' }]);
    await flush();
    c.GameState.current = { location: 'B' }; c.Chat.messages = []; c.Chat.summary = 'B summary';
    g.resolve({ text: 'old result' });
    await assert.rejects(pending, error => error.code === 'BAO_ABORTED');
    assert.equal(c.GameState.current.location, 'B', 'old snapshot finally cannot restore into another story');
    assert.equal(c.Chat.summary, 'B summary');
  }
  for (const change of ['source', 'action']) {
    const c = runtime(), g = gate();
    c.BAOGameplayUICore = require('../js/gameplay-ui-core.js');
    c.GameState.current.modules = { economy: { gold: 100 } };
    c.Chat.messages[1].revisionBase.state.modules = { economy: { gold: 100 } };
    c.API.send = () => g.promise;
    vm.runInContext(read('story-revision-state.js'), c);
    const pending = c.API.send({ __storyTool: true }, [{ role: 'system', content: 'prompt' }]);
    await flush();
    if (change === 'source') c.Chat.messages[0].content = 'new player source';
    else {
      c.GameState.current.modules.economy.gold = 80;
      c.GameState.current.gameplayActionVersions = { 'modules.economy.gold': 1 };
    }
    g.resolve({ text: 'stale revision' });
    await assert.rejects(pending, error => error.code === 'BAO_ABORTED');
    assert.equal(c.GameState.current.location, 'current');
    if (change === 'action') assert.equal(c.GameState.current.modules.economy.gold, 80, 'in-flight local payment survives restoring the pre-request world');
  }
  console.log('status/revision entry ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

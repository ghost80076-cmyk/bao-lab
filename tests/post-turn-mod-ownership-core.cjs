'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function setup(kind, stage) {
  let resolve, reject;
  const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
  const calls = [], notices = [];
  let baseCalls = 0, saves = 0;
  const input = { value: 'player' };
  const pair = () => [{ id: 'u', role: 'user', content: 'player' }, { id: 'a', role: 'assistant', content: 'scene' }];
  const state = () => ({ commentaryMods: { enabled: ['director-commentary'] }, interpretationMods: { enabled: ['bun-interpreter', 'class-monitor'] } });
  const ctx = vm.createContext({ structuredClone, addEventListener() {}, console: { warn() {} },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: id => id === 'user-input' ? input : null,
      createElement: () => ({}), head: { appendChild() {} } },
    BAOCommentaryModsCore: require('../js/commentary-mods-core.js'),
    BAOInterpretationModsCore: require('../js/interpretation-mods-core.js'),
    BAOFeedback: { notify: (...args) => notices.push(args) },
    GameState: { current: state() }, Chat: { messages: pair() },
    API: { send(config) { calls.push(config); return config.__interpretationTask === stage || config.__commentaryTask ? gate : Promise.resolve({ text: 'advisor output' }); } },
    App: { storyTurnReceipts: true, config: { api: { key: 'mock', model: 'mock', baseUrl: 'https://mock.test' } }, activeCharacter: { name: 'hero' },
      saveStory() { saves++; },
      async sendMessage() { baseCalls++; if (stage === 'main') return gate; ctx.Chat.messages.push(...pair().map(m => ({ ...m, id: 'new-' + m.id })));
        return { kind: 'bao:story-turn', assistantId: 'new-a', isCurrent: () => true }; },
      async buildMessages() { return [{ role: 'user', content: 'player' }]; },
      wrapSendMessage(id, wrapper) { const next = this.sendMessage.bind(this); this.sendMessage = (...args) => wrapper.call(this, next, ...args); },
      wrapBuildMessages(id, wrapper) { const next = this.buildMessages.bind(this); this.buildMessages = (...args) => wrapper.call(this, next, ...args); }
    }
  });
  ctx.window = ctx;
  vm.runInContext(read(kind === 'commentary' ? 'commentary-mods-general-pack.js' : 'interpretation-mods-official-pack.js'), ctx);
  vm.runInContext(read(kind + '-mods.js'), ctx);
  return { ctx, calls, notices, resolve, reject, state, stats: () => ({ baseCalls, saves }) };
}
(async () => {
  for (const [kind, stage] of [['commentary', 'commentary'], ['commentary', 'main'], ['interpretation', 'advisor'], ['interpretation', 'observer'], ['interpretation', 'main']]) {
    for (const change of ['story', 'config', 'source']) {
    for (const fail of stage === 'main' ? [false] : [false, true]) {
      const h = setup(kind, stage), { ctx } = h;
      const pending = stage === 'commentary' ? ctx.BAOCommentaryMods.generateLatest() : ctx.App.sendMessage();
      await flush();
      const before = h.stats(), requestCount = h.calls.length;
      if (change === 'story') {
        ctx.GameState.current = h.state();
        ctx.Chat.messages = [{ id: 'b-u', role: 'user', content: 'B player' }, { id: 'b-a', role: 'assistant', content: 'B scene' }];
      } else if (change === 'config') ctx.App.config = { ...ctx.App.config };
      else ctx.Chat.messages.at(-1).content = 'edited scene';
      const snapshot = JSON.stringify(ctx.GameState.current);
      if (fail) h.reject(new Error('old failure')); else h.resolve({ text: 'OLD OUTPUT' });
      await pending;
      assert.equal(JSON.stringify(ctx.GameState.current), snapshot, `${kind}/${stage}/${change}/${fail}: old output cannot mutate new story`);
      assert.equal(h.calls.length, requestCount, 'old continuation cannot initiate another model request');
      assert.deepEqual(h.stats(), before, 'old advisor cannot launch main story; old output cannot persist');
      assert.equal(h.notices.length, 0, 'old failure cannot notify the new story');
      const messages = await ctx.App.buildMessages();
      assert.doesNotMatch(JSON.stringify(messages), /OLD OUTPUT/, 'old advisor cannot contaminate later prompt assembly');
    }
  }
  }
  for (const kind of ['commentary', 'interpretation']) {
    const h = setup(kind, kind === 'commentary' ? 'commentary' : 'observer');
    const pending = kind === 'commentary' ? h.ctx.BAOCommentaryMods.generateLatest() : h.ctx.App.sendMessage();
    await flush();
    h.resolve({ text: 'normal output' });
    await pending;
    assert.ok(h.stats().saves > 0, 'normal auxiliary output still persists');
    assert.match(JSON.stringify(h.ctx.GameState.current), /normal output/);
  }
  console.log('post-turn MOD ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

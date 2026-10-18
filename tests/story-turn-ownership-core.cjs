'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const source = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
function setup(stage) {
  const gate = deferred(), input = { value: 'original input' }, label = { textContent: '' };
  const node = () => ({ innerHTML: '', remove() { this.removed = true; } });
  const stream = { children: [], scrollHeight: 1,
    insertAdjacentHTML() { this.appendChild(node()); },
    appendChild(n) { this.children.push(n); this.lastElementChild = n; } };
  let calls = 0, saves = 0, events = 0, memoryCalls = 0;
  const ctx = vm.createContext({ console: { warn() {} }, alert() {}, addEventListener() {},
    document: { getElementById: id => ({ 'user-input': input, 'chat-stream': stream, 'usage-memory': label })[id] || null,
      querySelector: () => null, createElement: node },
    Chat: { messages: [], summary: '', memoryHealth: { phase: 'idle' },
      add(role, content) { const m = { id: 'm' + this.messages.length, role, content }; this.messages.push(m); return m; },
      memoryStatus: () => 'memory', renderTurnUsage() {},
      afterTurn() { memoryCalls++; return stage === 'memory' ? gate.promise : Promise.resolve(); } },
    GameState: { current: { events: [] }, addEvent() { events++; } },
    API: { send() { calls++; return stage === 'provider' ? gate.promise : Promise.resolve({ text: 'reply' }); } }
  });
  ctx.window = ctx;
  vm.runInContext(source + '\nglobalThis.App = App;', ctx);
  ctx.App.config = { api: { key: 'mock' }, memory: { maxRounds: 4 }, displayMode: 'text' };
  ctx.App.activeCharacter = { name: 'A' };
  ctx.App.buildMessages = () => stage === 'build' ? gate.promise : Promise.resolve([]);
  ctx.App.saveStory = () => { saves++; };
  ctx.App.renderStoryMessage = text => text;
  return { ctx, gate, input, stream, label, stats: () => ({ calls, saves, events, memoryCalls }) };
}
(async () => {
  for (const stage of ['build', 'provider', 'memory']) {
    for (const failure of [false, true]) {
      for (const change of ['story', 'history', 'config']) {
        const { ctx, gate, input, stream, label, stats } = setup(stage);
        const pending = ctx.App.sendMessage();
        await flush();
        const before = stats();
        if (change === 'story') {
          ctx.GameState.current = { events: [] };
          ctx.Chat.messages = [{ id: 'new', role: 'assistant', content: 'new story' }];
        } else if (change === 'config') ctx.App.config = { ...ctx.App.config };
        else ctx.Chat.messages[0].content = 'edited branch source';
        ctx.Chat.memoryHealth = { phase: 'idle', message: 'current health' };
        const health = ctx.Chat.memoryHealth;
        const history = JSON.stringify(ctx.Chat.messages);
        input.value = 'current draft'; label.textContent = 'current label';
        const dom = stream.children.map(n => n.innerHTML);
        if (failure) gate.reject(new Error('old failure'));
        else gate.resolve(stage === 'provider' ? { text: 'stale reply' } : []);
        await pending;
        assert.equal(JSON.stringify(ctx.Chat.messages), history, `${stage}/${failure}/${change}: history belongs to current turn`);
        assert.equal(ctx.Chat.memoryHealth, health, 'stale memory failure cannot overwrite health');
        assert.deepEqual(stats(), before, 'stale continuation cannot send, save, add events or summarize');
        assert.equal(input.value, 'current draft');
        assert.equal(label.textContent, 'current label');
        assert.deepEqual(stream.children.map(n => n.innerHTML), dom, 'stale continuation cannot paint errors or reply');
        assert.ok(stream.children.every(n => !n.removed), 'stale failure cannot remove current DOM');
      }
    }
  }
  const { ctx, stats } = setup('normal');
  ctx.App.buildMessages = async () => {
    ctx.Chat.messages = ctx.Chat.messages.map(message => ({ ...message }));
    return [];
  };
  await ctx.App.sendMessage();
  assert.equal(ctx.Chat.messages.at(-1).content, 'reply');
  assert.deepEqual(stats(), { calls: 1, saves: 1, events: 1, memoryCalls: 1 });
  console.log('story turn ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

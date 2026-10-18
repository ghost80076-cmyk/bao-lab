const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(`js/${name}.js`, 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function base(named) {
  const wait = deferred(), args = [];
  const nodes = [];
  const node = () => ({ style: {}, dataset: {}, classList: { contains: () => false }, append() {}, before() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const stream = { ...node(), scrollTop: 0, clientHeight: 420, querySelectorAll: () => nodes, querySelector: () => nodes.at(-1), getBoundingClientRect: () => ({ top: 100 }) };
  const chat = { ...node(), classList: { contains: () => true }, querySelector: s => s === '.composer' ? node() : null };
  const input = { value: 'go' }, created = [];
  const c = { console, GameState: { current: {} }, Chat: { messages: [], add() {}, context: async () => [] }, Storage: { clone: structuredClone },
    document: { head: { append() {}, appendChild() {} }, createElement: () => { const n = node(); created.push(n); return n; }, querySelector: () => null,
      getElementById: id => ({ 'chat-stream': stream, 'chat-view': chat, 'user-input': input })[id] },
    setTimeout() {}, scrollTo() {} };
  c.window = c;
  c.App = { config: {}, activeCharacter: {}, escapeHTML: x => x, renderChatShell() {},
    sendMessage: async function(...a) { args.push(a); return wait.promise; } };
  if (named) c.App.wrapSendMessage = (name, wrapper) => { const previous = c.App.sendMessage; c.App.sendMessage = function(...a) { return wrapper.call(this, previous.bind(this), ...a); }; };
  vm.createContext(c);
  return { c, wait, nodes, stream, input, created, args };
}
async function feedback(named) {
  for (const change of ['story', 'config', 'character', 'none']) {
    const h = base(named); vm.runInContext(read('chat-experience-repairs'), h.c);
    const task = h.c.App.sendMessage('arg');
    if (change === 'story') h.c.GameState.current = {};
    if (change === 'config') h.c.App.config = {};
    if (change === 'character') h.c.App.activeCharacter = {};
    let removed = false;
    h.nodes.push({ classList: { contains: x => x === 'assistant' }, querySelector: () => ({ textContent: '連線失敗：new' }), remove: () => { removed = true; } });
    h.wait.resolve('result'); assert.equal(await task, 'result');
    assert.equal(removed, change === 'none', `failure DOM ownership: ${change}`);
    assert.deepEqual(h.args, [['arg']]);
  }
}
async function reading(named) {
  for (const change of ['story', 'config', 'character', 'none']) {
    const h = base(named); const api = deferred(), ready = deferred(); h.c.API = { send: () => api.promise };
    const pending = { isConnected: true, style: {}, classList: { contains: () => true }, querySelector: () => ({ textContent: '正在生成……' }) };
    h.c.App.sendMessage = async (...a) => { h.args.push(a); h.nodes.push({ isConnected: true, nextElementSibling: pending, getBoundingClientRect: () => ({ top: 350 - h.stream.scrollTop }) }); await h.c.API.send({}); ready.resolve(); return h.wait.promise; };
    vm.runInContext(read('chat-reading-scroll'), h.c);
    const task = h.c.App.sendMessage('arg'); h.stream.scrollTop = 99;
    api.resolve(); await ready.promise;
    if (change === 'story') h.c.GameState.current = {};
    if (change === 'config') h.c.App.config = {};
    if (change === 'character') h.c.App.activeCharacter = {};
    h.stream.scrollTop = 777; h.wait.resolve('result');
    assert.equal(await task, 'result');
    assert.equal(h.stream.scrollTop, change === 'none' ? 99 : 777, `reading ownership: ${change}`);
    assert.deepEqual(h.args, [['arg']]);
  }
}
async function overlappingReading(named) {
  const h = base(named), calls = [];
  h.c.API = { send: async () => { const call = calls.at(-1); await call.api.promise; return call.id; } };
  h.c.App.sendMessage = async () => {
    const call = { id: calls.length, api: deferred(), commit: deferred(), ready: deferred() };
    calls.push(call);
    const pending = { isConnected: true, style: {}, classList: { contains: () => true }, querySelector: () => ({ textContent: '正在生成……' }) };
    call.pending = pending;
    h.nodes.push({ isConnected: true, nextElementSibling: pending, getBoundingClientRect: () => ({ top: 350 - h.stream.scrollTop }) });
    await h.c.API.send({}); call.ready.resolve(); return call.commit.promise;
  };
  vm.runInContext(read('chat-reading-scroll'), h.c);
  const old = h.c.App.sendMessage();
  h.c.GameState.current = {};
  h.nodes.length = 0;
  const current = h.c.App.sendMessage();
  assert.equal(calls[1].pending.style.minHeight, '420px', 'new story can acquire its own anchor');
  h.stream.scrollTop = 88; calls[1].api.resolve(); await calls[1].ready.promise;
  h.stream.scrollTop = 123; calls[0].api.resolve(); await calls[0].ready.promise;
  calls[0].commit.resolve('old'); assert.equal(await old, 'old');
  assert.equal(h.stream.scrollTop, 123);
  assert.equal(calls[1].pending.style.minHeight, '420px', 'old finally leaves current placeholder intact');
  calls[1].commit.resolve('current'); assert.equal(await current, 'current');
  assert.equal(h.stream.scrollTop, 88, 'old API completion cannot overwrite the new snapshot');
  assert.equal(calls[1].pending.style.minHeight, '');
}
async function readerArgs() {
  const h = base(false); vm.runInContext(read('story-reader'), h.c);
  const task = h.c.App.sendMessage('first', { second: true }); h.wait.resolve('result');
  assert.equal(await task, 'result'); assert.deepEqual(h.args, [['first', { second: true }]]);
}
(async () => { await feedback(false); await feedback(true); await reading(false); await reading(true); await overlappingReading(false); await overlappingReading(true); await readerArgs(); console.log('Reading hooks: owner/config/character isolation, normal completion, named/fallback and reader arguments passed'); })().catch(e => { console.error(e); process.exitCode = 1; });

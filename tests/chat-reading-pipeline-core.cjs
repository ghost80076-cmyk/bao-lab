const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(legacy) {
  const main = deferred(), helper = deferred(), commit = deferred(), ready = deferred();
  const users = [], calls = [];
  const pending = { classList: { contains: value => value === 'assistant' }, style: {}, isConnected: true,
    querySelector: () => ({ textContent: '正在生成……' }) };
  const stream = { scrollTop: 0, clientHeight: 420,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => users };
  const input = { value: 'continue' };
  const c = { console,
    document: { getElementById: id => ({ 'chat-stream': stream, 'chat-view': { classList: { contains: () => true } }, 'user-input': input })[id] }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(read('api.js') + '\nwindow.API = API;', c);
  c.API.send = async (config, ...args) => {
    calls.push({ config, args });
    return config.helperProbe ? helper.promise : main.promise;
  };
  if (legacy) c.API.wrapSend = undefined;
  c.App = { async sendMessage() {
    if (!input.value.trim()) return 'empty';
    const player = { isConnected: true, nextElementSibling: pending,
      getBoundingClientRect: () => ({ top: 350 - stream.scrollTop }) };
    users.push(player);
    stream.scrollTop = 5000;
    await Promise.resolve();
    try {
      const value = await c.API.send({ model: 'main' }, [], 'extra');
      ready.resolve();
      await commit.promise;
      return value;
    } finally { stream.scrollTop = 5000; }
  } };
  vm.runInContext(read('chat-reading-scroll.js'), c);
  if (!legacy) {
    assert.deepEqual(Array.from(c.API.inspectSendPipeline().activeSegment), ['chat-reading-scroll:before-commit']);
    assert.equal(c.API.inspectSendPipeline().legacyWrapperOnTop, false);
  }
  const installed = c.API.send;
  vm.runInContext(read('chat-reading-scroll.js'), c);
  assert.equal(c.API.send, installed, 're-evaluation must not install twice');
  return { c, stream, pending, calls, main, helper, ready, commit, input };
}
async function run(legacy) {
  // Late helper completion must not replace the reading position captured by the main response.
  for (const flags of [{ __memoryTask: true }, { __stateTask: true }, { __auxiliaryTask: true }, { __storyTool: true }, { __connectionTest: true }]) {
    const h = harness(legacy);
    const task = h.c.App.sendMessage();
    assert.equal(h.stream.scrollTop, 242);
    assert.equal(h.pending.style.minHeight, '420px');
    await Promise.resolve();
    h.stream.scrollTop = 99;
    const result = { text: 'story' };
    const background = h.c.API.send({ ...flags, helperProbe: true }, [], 'helper-extra');
    h.main.resolve(result);
    await h.ready.promise; // Main response has captured 99; App has not committed yet.
    h.stream.scrollTop = 150;
    h.helper.resolve({ text: 'helper' });
    await background;
    h.commit.resolve();
    assert.equal(await task, result);
    assert.equal(h.stream.scrollTop, 99, 'helper completion must not overwrite main reading snapshot');
    assert.equal(h.pending.style.minHeight, '');
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].args[1], 'extra');
    assert.equal(h.calls[1].args[1], 'helper-extra');
  }
  for (const code of ['BAO_ABORTED', 'PROVIDER_FAILURE']) {
    const h = harness(legacy);
    const task = h.c.App.sendMessage();
    await Promise.resolve();
    h.stream.scrollTop = 77;
    const error = Object.assign(new Error(code), { code });
    h.main.reject(error);
    await assert.rejects(task, value => value === error);
    assert.equal(h.stream.scrollTop, 77);
    assert.equal(h.pending.style.minHeight, '');
    assert.equal(h.calls.length, 1, 'reading controller must not retry transport');
    h.input.value = '';
    assert.equal(await h.c.App.sendMessage(), 'empty');
    assert.equal(h.stream.scrollTop, 77);
  }
}
run(false).then(() => run(true)).then(() => console.log('Reading pipeline: late helper isolation, cancellation, error identity, position, cleanup, arguments and duplicate guard passed')).catch(error => {
  console.error(error); process.exitCode = 1;
});

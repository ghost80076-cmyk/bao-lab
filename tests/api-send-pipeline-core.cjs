const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
function runtime() {
  const sandbox = { console, URL, setTimeout, clearTimeout, TextDecoder };
  sandbox.window = sandbox;
  sandbox.App = { config: {
    api: { model: 'main', baseUrl: 'https://main.test/v1', key: 'main-key' },
    memory: { summaryApi: { model: 'summary', baseUrl: 'https://memory.test/v1', key: 'memory-key' } }
  } };
  vm.createContext(sandbox);
  vm.runInContext(read('api.js') + '\n;globalThis.api = API;', sandbox);
  return sandbox;
}
async function contracts() {
  const { api } = runtime();
  const calls = [];
  const result = { text: 'story', usage: { total_tokens: 10 } };
  const config = { signal: new AbortController().signal };
  const messages = Object.freeze([Object.freeze({ role: 'user', content: 'hello' })]);
  api.send = async (c, m, extra) => {
    assert.equal(c, config); assert.equal(m, messages); assert.equal(extra, 'extra');
    calls.push('transport'); return result;
  };
  const stage = id => async (next, ...args) => {
    calls.push(id + ':before');
    const value = await next(...args);
    calls.push(id + ':after'); return value;
  };
  api.wrapSend('inner', stage('inner'));
  const captured = api.send;
  api.wrapSend('outer', stage('outer'));
  assert.equal(await captured(config, messages, 'extra'), result);
  assert.deepEqual(calls.splice(0), ['inner:before', 'transport', 'inner:after']);
  assert.equal(await api.send(config, messages, 'extra'), result);
  assert.deepEqual(calls.splice(0), ['outer:before', 'inner:before', 'transport', 'inner:after', 'outer:after']);
  assert.deepEqual(Array.from(api.inspectSendPipeline().activeSegment), ['outer', 'inner']);
  const inspection = api.inspectSendPipeline();
  inspection.activeSegment.length = 0;
  assert.equal(api.inspectSendPipeline().activeSegment.length, 2);

  // Existing direct assignments must remain a boundary, without recursion or skips.
  const legacyNext = api.send.bind(api);
  api.send = async (...args) => { calls.push('legacy'); return legacyNext(...args); };
  assert.equal(api.inspectSendPipeline().legacyWrapperOnTop, true);
  api.wrapSend('new', stage('new'));
  assert.equal(await api.send(config, messages, 'extra'), result);
  assert.deepEqual(calls.splice(0), ['new:before', 'legacy', 'outer:before', 'inner:before', 'transport', 'inner:after', 'outer:after', 'new:after']);
  assert.deepEqual(Array.from(api.inspectSendPipeline().activeSegment), ['new']);
  assert.equal(api.wrapSend('inner', () => { throw Error('duplicate'); }), false);

  // Errors and short circuits preserve object identity and avoid transport work.
  const failure = new Error('cancelled'); failure.code = 'BAO_ABORTED';
  api.wrapSend('cancel', () => { throw failure; });
  await assert.rejects(api.send(config, messages), e => e === failure);
  api.wrapSend('short-circuit', () => result);
  assert.equal(await api.send(config, messages), result);
  assert.deepEqual(calls, []);

  // A registration during an awaited request affects only later calls.
  const inflight = runtime().api;
  let release;
  inflight.send = () => new Promise(resolve => { release = resolve; });
  inflight.wrapSend('waiting', (next, ...args) => next(...args));
  const pending = inflight.send({}, []);
  inflight.wrapSend('later', () => ({ text: 'later' }));
  release(result);
  assert.equal(await pending, result);
  assert.equal((await inflight.send({}, [])).text, 'later');
}
async function realModules() {
  for (const order of [['global-bridge.js', 'helper-api-routing.js'], ['helper-api-routing.js', 'global-bridge.js']]) {
    const sandbox = runtime();
    let received;
    sandbox.api.send = async (config, messages) => { received = { config, messages }; return { text: 'OK' }; };
    for (const file of order) {
      // The trailing loader only appends optional UI scripts and is irrelevant here.
      const source = read(file);
      vm.runInContext(file === 'helper-api-routing.js' ? source.split('// Load local and credential-reconnect')[0] : source, sandbox);
    }
    const input = [{ role: 'user', content: '<div>one<br>two</div>' }];
    const config = { ...sandbox.App.config.api, __memoryTask: true, maxOutputTokens: 123, signal: new AbortController().signal };
    await sandbox.api.send(config, input);
    assert.equal(received.config.model, 'summary');
    assert.equal(received.config.key, 'memory-key');
    assert.equal(received.config.signal, config.signal);
    assert.equal(received.config.maxOutputTokens, 123);
    assert.equal(received.messages[0].content, 'one\ntwo');
    assert.equal(input[0].content, '<div>one<br>two</div>');
    assert.equal(config.model, 'main');
    await sandbox.api.send({ ...config, __memoryTask: false }, input);
    assert.equal(received.config.model, 'main');
    assert.equal(received.messages, input);
    await sandbox.api.send({ ...config, __connectionTest: true }, input);
    assert.equal(received.config.model, 'main');
  }
}
contracts().then(realModules).then(() => console.log('API send pipeline snapshots, legacy boundaries and real helper routing passed')).catch(error => {
  console.error(error); process.exitCode = 1;
});

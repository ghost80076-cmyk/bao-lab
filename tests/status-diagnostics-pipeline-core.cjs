const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
function harness(legacy) {
  const c = {
    console,
    document: { querySelector: () => null, getElementById: () => null },
    App: { config: { api: { maxOutputTokens: 4096 } }, renderUIPanel() {}, renderChatShell() {} },
    GameState: { current: { npcs: [] } },
    BAOCharacterStatus: { snapshotForTracker: () => ({}), compactForPrompt: () => ({}) },
    WorldStateEngine: {},
    Chat: { messages: [], usage: {}, addUsage() {}, renderUsage() {}, renderTurnUsage() {}, reset() {} }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(read('api.js') + '\nwindow.API = API;', c);
  const calls = [];
  let result = { text: '{}', finishReason: 'STOP', credits: { request_id: 'request-1' } };
  let reject;
  let wait;
  c.API.send = async (config, messages) => {
    calls.push({ config, messages });
    if (reject) throw reject;
    return wait || result;
  };
  if (legacy) c.API.wrapSend = undefined;
  vm.runInContext(read('status-usage-integrity.js'), c);
  if (!legacy) {
    assert.deepEqual(Array.from(c.API.inspectSendPipeline().activeSegment), ['status-usage-integrity:state-diagnostics']);
    assert.equal(c.API.inspectSendPipeline().legacyWrapperOnTop, false);
  }
  const installed = c.API.send;
  const panel = c.App.renderUIPanel;
  vm.runInContext(read('status-usage-integrity.js'), c);
  assert.equal(c.API.send, installed, 'reloading must not duplicate the request observer');
  assert.equal(c.App.renderUIPanel, panel, 'reloading must not duplicate UI adapters');
  return { c, calls, result(value) { result = value; }, reject(value) { reject = value; }, wait(value) { wait = value; } };
}
async function run(legacy) {
  const h = harness(legacy), { c } = h;
  const signal = new AbortController().signal;
  const config = Object.freeze({ __stateTask: true, maxOutputTokens: 1200, signal });
  const messages = Object.freeze([
    Object.freeze({ role: 'system', content: 'track state' }),
    Object.freeze({ role: 'user', content: 'story input' })
  ]);
  for (const [limit, expected] of [[4096, 2400], [900, 900], ['700', 700], [undefined, 2400], [0, 2400], [-1, 2400], ['invalid', 2400]]) {
    c.App.config.api.maxOutputTokens = limit;
    const result = await c.API.send(config, messages);
    assert.equal(result.text, '{}');
    const sent = h.calls.at(-1);
    assert.equal(sent.config.maxOutputTokens, expected);
    assert.equal(sent.config.signal, signal);
    assert.equal(sent.messages[1], messages[1]);
    assert.match(sent.messages[0].content, /人物建檔/);
    assert.equal(messages[0].content, 'track state');
    assert.equal(config.maxOutputTokens, 1200);
  }
  assert.equal(c.GameState.current.stateRequestDiagnostics.requestId, 'request-1');
  assert.equal(c.GameState.current.stateRequestDiagnostics.finishReason, 'STOP');
  assert.equal(c.GameState.current.stateRequestDiagnostics.parsed, false);
  assert.equal(c.GameState.current.stateRequestDiagnostics.applied, false);

  const diagnostics = c.GameState.current.stateRequestDiagnostics;
  for (const flags of [{}, { __memoryTask: true }, { __auxiliaryTask: true }, { __storyTool: true }, { __connectionTest: true }]) {
    await c.API.send(flags, messages);
    assert.equal(h.calls.at(-1).config, flags);
    assert.equal(h.calls.at(-1).messages, messages);
    assert.equal(c.GameState.current.stateRequestDiagnostics, diagnostics);
  }
  for (const finishReason of ['MAX_TOKENS', 'length']) {
    h.result({ text: '{"partial":', finishReason });
    await assert.rejects(c.API.send(config, messages), /截斷/);
    assert.equal(c.GameState.current.stateRequestDiagnostics.finishReason, finishReason.toUpperCase());
    assert.equal(c.GameState.current.stateRequestDiagnostics.applied, false);
  }
  const beforeFailure = c.GameState.current.stateRequestDiagnostics;
  for (const code of ['BAO_ABORTED', 'PROVIDER_FAILURE']) {
    const error = Object.assign(new Error(code), { code });
    h.reject(error);
    const before = h.calls.length;
    await assert.rejects(c.API.send(config, messages), value => value === error);
    assert.equal(h.calls.length, before + 1, 'diagnostics must not retry transport');
    assert.equal(c.GameState.current.stateRequestDiagnostics, beforeFailure);
  }
  h.reject(null);

  // An old request cannot write diagnostics into either story after a switch.
  const owner = c.GameState.current;
  let complete;
  h.wait(new Promise(resolve => { complete = resolve; }));
  const pending = c.API.send(config, messages);
  const nextStory = { npcs: [] };
  c.GameState.current = nextStory;
  const result = { text: '{}', finishReason: 'STOP' };
  complete(result);
  assert.equal(await pending, result);
  assert.equal(nextStory.stateRequestDiagnostics, undefined);
  assert.equal(owner.stateRequestDiagnostics, beforeFailure);
  h.wait(null);
  c.GameState.current = null;
  h.result(result);
  assert.equal(await c.API.send(config, messages), result);
}
run(false).then(() => run(true)).then(() => console.log('State diagnostics: limits, immutable requests, task isolation, truncation, owner switch, errors and fallback passed')).catch(error => {
  console.error(error); process.exitCode = 1;
});

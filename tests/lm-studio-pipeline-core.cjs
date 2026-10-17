const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
const json = () => new Response(JSON.stringify({ choices: [{ message: { content: 'local reply' } }], usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } }), { headers: { 'content-type': 'application/json' } });
function harness(legacy) {
  const requests = [], cloud = [], styles = [];
  let respond = async () => json();
  const c = {
    console, URL, TextDecoder, setTimeout, clearTimeout,
    fetch: async (url, init) => { requests.push({ url, init }); return respond(url, init); },
    document: { readyState: 'loading', head: { append: node => styles.push(node) }, createElement: () => ({}), addEventListener() {}, getElementById: () => null, querySelector: () => null },
    App: { config: { api: {}, memory: {}, cost: {} }, collectConfig() {}, startStory() {}, renderChatShell() {} },
    Storage: { restoreStory() {} }, GameState: { current: {} }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(read('api.js') + '\nwindow.API = API;', c);
  vm.runInContext(read('lm-studio-core.js'), c);
  const cloudResult = { text: 'cloud reply' };
  c.API.send = async (config, messages) => { cloud.push({ config, messages }); return cloudResult; };
  if (legacy) c.API.wrapSend = undefined;
  vm.runInContext(read('lm-studio.js'), c);
  if (!legacy) {
    assert.deepEqual(Array.from(c.API.inspectSendPipeline().activeSegment), ['lm-studio:local-transport']);
    assert.equal(c.API.inspectSendPipeline().legacyWrapperOnTop, false);
  }
  const send = c.API.send, collect = c.App.collectConfig;
  vm.runInContext(read('lm-studio.js'), c);
  assert.equal(c.API.send, send);
  assert.equal(c.App.collectConfig, collect);
  assert.equal(styles.length, 1);
  return { c, requests, cloud, cloudResult, respond(fn) { respond = fn; } };
}
async function run(legacy) {
  const h = harness(legacy), { c } = h;
  const messages = Object.freeze([Object.freeze({ role: 'user', content: 'hello' })]);
  const remote = Object.freeze({ type: 'openrouter', model: 'cloud-model', baseUrl: 'https://cloud.test/v1', key: 'cloud-key' });
  assert.equal(await c.API.send(remote, messages), h.cloudResult);
  assert.equal(h.cloud[0].config, remote);
  assert.equal(h.cloud[0].messages, messages);
  assert.equal(h.requests.length, 0);

  const signal = new AbortController().signal;
  const local = Object.freeze({ type: 'lmstudio', route: 'local', model: 'local-model', baseUrl: 'http://localhost:1234/v1', key: c.BAOLMStudioCore.NO_AUTH, maxOutputTokens: 100, signal });
  const result = await c.API.send(local, messages);
  assert.equal(result.text, 'local reply');
  assert.equal(result.usage.input_tokens, 8);
  assert.equal(result.usage.output_tokens, 2);
  assert.equal(h.cloud.length, 1, 'local transport must bypass cloud');
  assert.equal(h.requests.at(-1).url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(h.requests.at(-1).init.signal, signal);
  assert.equal(h.requests.at(-1).init.headers.Authorization, undefined);
  assert.equal(JSON.parse(h.requests.at(-1).init.body).max_tokens, 100);
  assert.deepEqual(JSON.parse(h.requests.at(-1).init.body).messages, messages);

  for (const kind of ['memory', 'state']) {
    const helper = { ...local, model: kind + '-local', key: 'local-token' };
    if (kind === 'memory') c.App.config.memory.summaryApi = helper;
    else c.App.config.cost.stateApi = helper;
    c.API.activeSignal = signal;
    const config = { ...remote, [kind === 'memory' ? '__memoryTask' : '__stateTask']: true, maxOutputTokens: 321 };
    await c.API.send(config, messages);
    assert.equal(h.cloud.length, 1);
    const request = h.requests.at(-1);
    assert.equal(JSON.parse(request.init.body).model, kind + '-local');
    assert.equal(JSON.parse(request.init.body).max_tokens, 321);
    assert.equal(request.init.signal, signal);
    assert.equal(request.init.headers.Authorization, 'Bearer local-token');
    assert.equal(config.model, 'cloud-model');
    assert.equal(helper.maxOutputTokens, 100);
  }
  c.App.config.memory = {}; c.App.config.cost = {};
  const deltas = [];
  h.respond(async () => new Response('data: {"choices":[{"delta":{"content":"local stream"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const streamed = await c.API.send({ ...local, stream: true, onDelta: (delta, full) => deltas.push([delta, full]) }, messages);
  assert.equal(streamed.text, 'local stream');
  assert.deepEqual(deltas, [['local stream', 'local stream']]);
  assert.equal(JSON.parse(h.requests.at(-1).init.body).stream, true);

  for (const failure of ['abort', 'network', 'http']) {
    h.respond(async () => {
      if (failure === 'abort') throw Object.assign(new Error('cancel'), { name: 'AbortError' });
      if (failure === 'network') throw new TypeError('offline');
      return new Response('{"error":{"message":"model unavailable"}}', { status: 500 });
    });
    const count = h.requests.length;
    await assert.rejects(c.API.send(local, messages), error => failure === 'abort' ? error.code === 'BAO_ABORTED' : /CORS|500/.test(error.message));
    assert.equal(h.requests.length, count + 1, 'local failure must not retry');
    assert.equal(h.cloud.length, 1, 'local failure must not fall back to cloud');
  }
  const count = h.requests.length;
  await assert.rejects(c.API.send({ ...local, baseUrl: 'http://remote.test/v1' }, messages), /本機/);
  assert.equal(h.requests.length, count, 'invalid local endpoint must fail before fetch');
  assert.equal(h.cloud.length, 1);
}
run(false).then(() => run(true)).then(() => console.log('LM Studio pipeline: cloud passthrough, local helpers, auth, limits, signals, real SSE, errors, no fallback and duplicate guard passed')).catch(error => {
  console.error(error); process.exitCode = 1;
});

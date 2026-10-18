const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const cloud = (model = 'main-cloud') => ({ type: 'custom', protocol: 'openai', model, baseUrl: 'https://cloud.test/v1/chat/completions', key: 'cloud-key' });
const local = (model = 'main-local') => ({ type: 'lmstudio', route: 'local', protocol: 'openai', model, baseUrl: 'http://localhost:1234/v1', key: 'BAO_LOCAL_NO_AUTH' });
const hosted = () => ({ type: 'bao-credits', route: 'bao-credits', model: 'gemini-3-flash-preview', baseUrl: 'https://api.yorubay.com/chat', key: '__YORUBAY_ACCOUNT__' });
const orders = [
  ['usage', 'budget', 'route', 'clean', 'hosted', 'local'],
  ['local', 'hosted', 'clean', 'route', 'budget', 'usage'],
  ['route', 'usage', 'local', 'budget', 'hosted', 'clean'],
  ['clean', 'budget', 'local', 'usage', 'route', 'hosted']
];
function harness(order) {
  const requests = [], ready = [];
  const c = {
    console, URL, TextDecoder, TextEncoder, AbortController,
    setTimeout(fn) { fn(); return 0; }, clearTimeout() {},
    addEventListener(event, fn) { if (event === 'DOMContentLoaded') ready.push(fn); },
    document: { readyState: 'loading', getElementById: () => null, querySelector: () => null,
      createElement: () => ({ addEventListener() {} }), addEventListener() {}, head: { append() {}, appendChild() {} } },
    localStorage: { getItem: key => key === 'yorubay:session' ? 'yb_s_' + 'A'.repeat(43) : null },
    Storage: { restoreStory() {} }, GameState: { current: { npcs: [] } },
    MutationObserver: class { observe() {} },
    App: { config: { api: cloud(), memory: {}, cost: { usdTwd: 32, budgetTwd: 0 } },
      modelRegistry: { models: [{ id: 'gemini', hosted: { route_id: 'official' }, routes: [{ id: 'official', provider: 'gemini', model: 'gemini-3-flash-preview' }] }] },
      modelPresets: [], collectConfig() { return this.config; }, startStory() {}, renderChatShell() {}, populateAPIControls() {}, syncSelectedPreset() {} },
    fetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      const body = url === 'https://api.yorubay.com/chat'
        ? { content: 'hosted result', request_id: 'hosted-1', usage: { input_tokens: 10, output_tokens: 2, charged_microusd: 1000 } }
        : { choices: [{ message: { content: 'provider result' } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(read('api.js') + '\nwindow.API = API;', c);
  vm.runInContext(read('chat.js') + '\nwindow.Chat = Chat;', c);
  const usage = ready.pop();
  vm.runInContext(read('lm-studio-core.js'), c);
  let localSnapshot;
  const files = { budget: 'cost-control.js', route: 'helper-api-routing.js', clean: 'global-bridge.js', hosted: 'credits-pilot.js', local: 'lm-studio.js' };
  for (const name of order) {
    if (name === 'usage') usage();
    else {
      const count = ready.length;
      vm.runInContext(read(files[name]), c);
      if (name === 'local') localSnapshot = c.API.send;
      ready.splice(count).forEach(fn => fn());
    }
  }
  return { c, requests, localSnapshot };
}
async function scenario(order, main, flags = {}, helper, mode = 'separate') {
  const h = harness(order), { c } = h;
  c.App.config.api = main;
  c.App.config.memory = { summaryApi: helper, summaryApiMode: mode };
  if (flags.__stateTask) Object.assign(c.App.config.cost, { stateApi: helper, stateApiMode: mode });
  const messages = Object.freeze([Object.freeze({ role: 'user', content: '<div>memory<br>text</div>' })]);
  await c.API.send({ ...main, ...flags, maxOutputTokens: 9000, retryEnabled: false }, messages);
  assert.equal(messages[0].content, '<div>memory<br>text</div>');
  return h;
}
async function run() {
  for (const order of orders) {
    const label = order.join(',');
    const ordinary = await scenario(order, local());
    const routed = await scenario(order, local(), { __memoryTask: true }, cloud('memory-cloud'));
    const signal = new AbortController().signal;
    const memory = await scenario(order, cloud(), { __memoryTask: true, signal }, { ...local('memory-local'), signal: new AbortController().signal });
    const sparseHelper = await scenario(order, { ...cloud(), type: 'gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models' }, { __memoryTask: true }, { model: 'sparse-cloud', baseUrl: cloud().baseUrl, key: 'helper-key' });
    const state = await scenario(order, hosted(), { __stateTask: true }, local('state-local'));
    const hostedMain = await scenario(order, hosted());
    const hostedHelper = await scenario(order, cloud(), { __memoryTask: true }, hosted());
    const hostedToCloud = await scenario(order, hosted(), { __memoryTask: true }, cloud('memory-cloud'));
    const sharedHosted = await scenario(order, hosted(), { __memoryTask: true }, { model: hosted().model, baseUrl: hosted().baseUrl });
    const same = await scenario(order, cloud(), { __memoryTask: true }, local('stale-local'), 'same');
    const diagnostic = await scenario(order, cloud(), { __memoryTask: true, __connectionTest: true }, local('stale-local'));
    const blocked = harness(order);
    blocked.c.App.config.api = local();
    blocked.c.App.config.cost.budgetTwd = 1;
    blocked.c.Chat.usageLedger.push({ actualUsd: 1 });
    let budgetBlocked = false;
    try { await blocked.c.API.send(local(), [{ role: 'user', content: 'hello' }]); } catch (e) { budgetBlocked = /預算/.test(e.message); }
    assert.equal(ordinary.c.Chat.usageLedger.length, 1, label + ': local usage must be recorded');
    assert.equal(routed.requests[0].body.model, 'memory-cloud', label + ': route before local short circuit');
    assert.equal(routed.c.Chat.usageLedger[0].model, 'memory-cloud');
    assert.equal(memory.requests[0].body.model, 'memory-local');
    assert.equal(memory.requests[0].init.signal, signal, 'helper config must not replace the request cancellation signal');
    assert.equal(memory.requests[0].body.max_tokens, 1800, label + ': cap before local transport');
    assert.equal(memory.requests[0].body.messages[0].content, 'memory\ntext');
    assert.equal(memory.c.Chat.usageLedger.length, 1);
    assert.equal(memory.c.Chat.usageLedger[0].model, 'memory-local');
    assert.equal(memory.c.Chat.lastStoryPromptTokens, 0);
    assert.equal(sparseHelper.requests[0].url, cloud().baseUrl, 'helper must not inherit the main Gemini protocol');
    assert.equal(sparseHelper.requests[0].body.model, 'sparse-cloud');
    assert.equal(state.requests[0].body.model, 'state-local');
    assert.equal(state.requests[0].body.max_tokens, 2400);
    assert.equal(state.c.Chat.usageLedger[0].kind, 'state');
    assert.equal(hostedMain.c.Chat.usageLedger.length, 1, label + ': hosted result must not double count');
    assert.equal(hostedMain.c.Chat.usageLedger[0].actualUsd, 0.001);
    assert.equal(hostedHelper.requests[0].url, hosted().baseUrl);
    assert.equal(hostedHelper.requests[0].body.max_output_tokens, 1800);
    assert.equal(hostedHelper.c.Chat.usageLedger.length, 1);
    assert.equal(hostedHelper.c.Chat.usageLedger[0].kind, 'memory');
    assert.equal(hostedToCloud.requests[0].url, cloud().baseUrl);
    assert.equal(hostedToCloud.requests[0].body.model, 'memory-cloud');
    assert.equal(sharedHosted.requests[0].url, hosted().baseUrl);
    assert.equal(sharedHosted.c.Chat.usageLedger[0].type, 'bao-credits');
    assert.equal(same.requests[0].body.model, 'main-cloud', label + ': same mode ignores stale helper');
    assert.equal(diagnostic.requests[0].body.model, 'main-cloud', label + ': diagnostic uses selected main route');
    assert.equal(diagnostic.c.Chat.usageLedger.length, 0);
    assert.equal(budgetBlocked, true, label + ': budget before local transport');
    assert.equal(blocked.requests.length, 0);
    for (const main of [cloud(), hosted()]) {
      const b = harness(order);
      b.c.App.config.api = main;
      b.c.App.config.cost.budgetTwd = 1;
      b.c.Chat.usageLedger.push({ actualUsd: 1 });
      await assert.rejects(b.c.API.send(main, [{ role: 'user', content: 'hello' }]), /預算/);
      assert.equal(b.requests.length, 0, 'budget must block before any provider is contacted');
      await b.c.API.send({ ...main, __connectionTest: true }, [{ role: 'user', content: 'test' }]);
      assert.equal(b.requests.length, 1, 'diagnostics remain usable at budget cap');
      assert.equal(b.c.Chat.usageLedger.length, 1, 'diagnostics do not enter usage ledger');
    }
    for (const h of [ordinary, routed, memory, sparseHelper, state, hostedMain, hostedHelper, hostedToCloud, sharedHosted, same, diagnostic]) assert.equal(h.requests.length, 1, 'one provider call per request');
  }
  console.log('Ordered pipeline integration: four installation orders preserve routing, sanitation, caps, budget, diagnostics and once-only usage');
}
async function streamingContracts() {
  for (const main of [cloud(), local(), hosted()]) for (const reverse of [false, true]) {
    const { c, requests } = harness(orders[reverse ? 1 : 0]);
    c.App.config.api = main;
    c.App.activeCharacter = { name: 'hero' };
    c.App.formatMessage = value => value;
    c.Chat.messages = [{ role: 'user', content: 'go' }];
    c.WorldStateEngine = { enabled: () => true, stateSnapshot: () => ({}), async update() {} };
    c.BAOHelperData = { moduleSchemas: () => ({}) };
    c.document.getElementById = id => id === 'chat-view' ? { classList: { contains: () => true } } : null;
    // A real main-story stream owns a stable pending bubble.
    const bubble = { innerHTML: '', closest: () => ({ classList: { add() {} } }) };
    c.document.querySelector = selector => selector === '#chat-stream > .message.assistant:last-child .bubble' ? bubble : null;
    c.queueMicrotask = queueMicrotask;
    c.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
    const deltas = [];
    c.dispatchEvent = event => { if (event.type === 'bao:stream-delta') deltas.push(event.detail.text); };
    for (const file of reverse ? ['streaming-ui.js', 'same-model-state-merge.js'] : ['same-model-state-merge.js', 'streaming-ui.js']) vm.runInContext(read(file), c);
    c.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, init, body });
      if (url === 'https://api.yorubay.com/chat') return new Response(JSON.stringify({ content: 'prose<BAO_STATE>{}</BAO_STATE>', usage: { input_tokens: 10, output_tokens: 2, charged_microusd: 1000 } }));
      assert.equal(body.stream, true);
      const chunks = ['prose', '<BA', 'O_STATE>', '{}', '</BAO_STATE>'];
      const data = chunks.map(content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n').join('') + 'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n';
      return new Response(data, { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await c.API.send(main, [{ role: 'user', content: 'go' }]);
    assert.equal(result.text, 'prose');
    assert.equal(c.Chat.usageLedger.length, 1, 'usage must be recorded before non-enumerable ledger markers are lost in transformed results');
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0].body.messages), /BAO_STATE_V1/);
    assert.ok(deltas.every(text => !text.includes('<BA') && !text.includes('{}')), 'UI deltas must never reveal the state appendix');
    if (main.type !== 'bao-credits') assert.ok(deltas.length > 0);
  }
  console.log('Ordered stream/state integration: cloud, local and hosted use one request, hide state deltas and account usage once');
}
async function lateHostedUsage() {
  for (const order of orders) {
    const { c } = harness(order);
    c.App.config.api = hosted();
    vm.runInContext(read('prompt-cache.js'), c);
    const oldUsage = c.Chat.usage, oldLedger = c.Chat.usageLedger;
    const record = c.Chat.recordRequestUsage.bind(c.Chat);
    c.Chat.recordRequestUsage = (config, result, context) => { assert.equal(context?.usage, oldUsage, 'accounting must target original refs'); return record(config, result, context); };
    let release;
    c.fetch = () => new Promise(resolve => { release = resolve; });
    const pending = c.API.send(hosted(), [{ role: 'user', content: 'go' }]);
    for (let i = 0; i < 30 && !release; i++) await Promise.resolve();
    assert.equal(typeof release, 'function');
    c.GameState.current = { npcs: [] };
    c.Chat.reset();
    let renders = 0;
    c.Chat.renderUsage = () => { renders++; };
    release(new Response(JSON.stringify({ content: 'late hosted result', request_id: 'late-1',
      usage: { input_tokens: 40, output_tokens: 2, charged_microusd: 2500 } })));
    await pending;
    assert.equal(c.Chat.usage.total, 0, 'late hosted tokens must not enter the new story');
    assert.equal(c.Chat.usageLedger.length, 0);
    assert.equal(c.Chat.lastStoryPromptTokens, 0);
    assert.equal(renders, 0, 'neither hosted nor outer accounting may repaint the new story');
    assert.equal(oldUsage.total, 42);
    assert.equal(oldLedger.length, 1, 'hosted plus outer wrapper record the original charge once');
    assert.equal(oldLedger[0].actualUsd, 0.0025);
  }
}
async function capturedSnapshotContract() {
  const { c, requests, localSnapshot } = harness(orders[1]);
  c.App.config.memory.summaryApi = local('legacy-helper');
  await localSnapshot({ ...cloud(), __memoryTask: true }, [{ role: 'user', content: 'summary' }]);
  assert.equal(requests[0].body.model, 'legacy-helper', 'a captured pre-routing snapshot retains its legacy local-helper selection');
}
async function abortContracts() {
  for (const main of [cloud(), local(), hosted()]) {
    const { c } = harness(orders[1]);
    c.App.config.api = main;
    let calls = 0;
    const signal = new AbortController().signal;
    c.fetch = async (_url, init) => {
      calls++;
      assert.equal(init.signal, signal);
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    };
    await assert.rejects(c.API.send({ ...main, signal, retryEnabled: false }, [{ role: 'user', content: 'hello' }]), e => e.code === 'BAO_ABORTED');
    assert.equal(calls, 1);
    assert.equal(c.Chat.usageLedger.length, 0);
  }
}
run().then(streamingContracts).then(abortContracts).then(capturedSnapshotContract).then(lateHostedUsage).catch(error => { console.error(error); process.exitCode = 1; });

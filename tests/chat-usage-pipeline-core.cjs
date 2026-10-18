const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
function runtime(legacy = false) {
  const ready = [];
  const context = {
    console, URL, TextDecoder, AbortController, clearTimeout() {},
    setTimeout(fn) { fn(); },
    document: { querySelector() { return null; }, getElementById() { return null; } },
    App: { config: { memory: { maxContext: 64000 } } },
    addEventListener(event, fn) { if (event === 'DOMContentLoaded') ready.push(fn); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('api.js') + '\nwindow.API = API;', context);
  if (legacy) context.API.wrapSend = undefined;
  vm.runInContext(source('chat.js') + '\nwindow.Chat = Chat;', context);
  return { context, install() { ready.forEach(fn => fn()); } };
}
const response = (n = 10) => ({ text: 'story', usage: { input_tokens: n, output_tokens: 2, total_tokens: n + 2 } });
async function contracts(legacy) {
  const { context: c, install } = runtime(legacy);
  let answer = response();
  let failure;
  let calls = 0;
  let received;
  c.API.send = async (config, messages) => {
    calls++; received = { config, messages };
    if (failure) throw failure;
    return answer;
  };
  install();
  install(); // DOM setup repeated must not register accounting twice.
  if (!legacy) {
    assert.deepEqual(Array.from(c.API.inspectSendPipeline().activeSegment), ['chat:request-usage']);
    assert.equal(c.API.inspectSendPipeline().legacyWrapperOnTop, false);
  }
  const messages = [{ role: 'user', content: 'hello' }];
  const config = { model: 'main', baseUrl: 'https://main.test/v1', key: 'private-key' };
  assert.equal(await c.API.send(config, messages), answer);
  assert.equal(received.config, config);
  assert.equal(received.messages, messages);
  assert.equal(calls, 1);
  assert.equal(c.Chat.usageLedger.length, 1);
  assert.equal(c.Chat.usageByKind.chat.calls, 1);
  assert.equal(c.Chat.lastStoryPromptTokens, 10);
  assert.equal(c.Chat.usageLedger[0].model, 'main');
  assert.equal(JSON.stringify(c.Chat.usageLedger).includes('private-key'), false);

  // Every helper category is accounted for without replacing the story's context budget.
  const cases = [
    [{ __memoryTask: true }, 'memory'],
    [{ __memoryTask: true, __memoryRepairTask: true }, 'memory-repair'],
    [{ __stateTask: true }, 'state'],
    [{ __auxiliaryTask: true }, 'auxiliary'],
    [{ __storyTool: true }, 'story-tool']
  ];
  for (const [flags, kind] of cases) {
    answer = response(100);
    await c.API.send({ ...config, ...flags }, messages);
    assert.equal(c.Chat.usageByKind[kind].calls, 1);
    assert.equal(c.Chat.usageLedger.at(-1).kind, kind);
    assert.equal(c.Chat.lastStoryPromptTokens, 10);
  }
  const entries = c.Chat.usageLedger.length;
  const total = c.Chat.usage.total;
  answer = response(500);
  await c.API.send({ ...config, __connectionTest: true }, messages);
  assert.equal(c.Chat.usageLedger.length, entries);
  assert.equal(c.Chat.usage.total, total);
  assert.equal(c.Chat.lastStoryPromptTokens, 10);

  // Hosted transport can record its actual charge before the outer Chat observer.
  answer = response(30);
  answer.credits = { charged_microusd: 1200 };
  const hosted = { ...config, type: 'bao-credits', model: 'hosted-model' };
  c.Chat.recordRequestUsage(hosted, answer);
  const hostedTotal = c.Chat.usage.total;
  assert.equal(await c.API.send(hosted, messages), answer);
  assert.equal(c.Chat.usage.total, hostedTotal);
  assert.equal(c.Chat.usageLedger.length, entries + 1);
  assert.equal(c.Chat.usageLedger.at(-1).actualUsd, 0.0012);

  // Transport failure and cancellation propagate unchanged and never create usage.
  for (const code of ['PROVIDER_FAILURE', 'BAO_ABORTED']) {
    failure = Object.assign(new Error(code), { code });
    await assert.rejects(c.API.send(config, messages), error => error === failure);
    assert.equal(c.Chat.usageLedger.length, entries + 1);
    assert.equal(c.Chat.usage.total, hostedTotal);
  }
  failure = null;
  answer = { text: 'no usage reported' };
  await c.API.send(config, messages);
  assert.equal(c.Chat.usageLedger.at(-1).input, null);
  assert.equal(c.Chat.usageLedger.at(-1).output, null);
  assert.equal(c.Chat.usageLedger.at(-1).actualUsd, null);
}
async function overlapping() {
  const { context: c, install } = runtime();
  const resolve = {};
  c.API.send = config => new Promise(done => { resolve[config.model] = done; });
  install();
  const main = c.API.send({ model: 'main' }, []);
  const state = c.API.send({ model: 'state', __stateTask: true }, []);
  resolve.state(response(50)); await state;
  assert.equal(c.Chat.lastStoryPromptTokens, 0);
  resolve.main(response(20)); await main;
  assert.equal(c.Chat.usageLedger.length, 2);
  assert.equal(c.Chat.usageLedger[0].kind, 'state');
  assert.equal(c.Chat.usageLedger[0].model, 'state');
  assert.equal(c.Chat.usageLedger[1].kind, 'chat');
  assert.equal(c.Chat.lastStoryPromptTokens, 20);
}
async function lexicalBoot() {
  const { context: c, install } = runtime();
  const api = c.API;
  api.send = async () => response();
  delete c.API; // Classic-script const API exists before any window.API bridge.
  install();
  assert.equal(api.__baoUsageWrapped, true, 'usage must install before asynchronous world-state scripts publish window.API');
  await api.send({ model: 'main' }, []);
  assert.equal(c.Chat.usageLedger.length, 1);
}
async function switchedStoryUsage() {
  for (const legacy of [false, true]) for (const cache of [false, true]) {
    for (const flags of [{}, { __memoryTask: true }, { __stateTask: true }, { __auxiliaryTask: true }]) {
      const { context: c, install } = runtime(legacy);
      c.GameState = { current: {} };
      let release;
      c.API.send = () => new Promise(resolve => { release = resolve; });
      install();
      if (cache) vm.runInContext(source('prompt-cache.js'), c);
      const oldUsage = c.Chat.usage, oldLedger = c.Chat.usageLedger;
      const pending = c.API.send({ model: 'original', ...flags }, []);
      c.GameState.current = {};
      c.Chat.reset();
      let renders = 0;
      c.Chat.renderUsage = () => { renders++; };
      const result = response(40);
      result.credits = { charged_microusd: 2500 };
      release(result);
      assert.equal(await pending, result);
      assert.equal(c.Chat.usage.total, 0, 'late usage cannot charge current story counters');
      assert.equal(c.Chat.usageLedger.length, 0, 'late entry cannot enter current story ledger');
      assert.equal(c.Chat.lastStoryPromptTokens, 0, 'late main reply cannot replace current context pressure');
      assert.equal(renders, 0, 'late usage cannot repaint current story');
      assert.equal(oldUsage.total, 42, 'original usage collection retains the reported tokens');
      assert.equal(oldLedger.length, 1);
      assert.equal(oldLedger[0].actualUsd, 0.0025);
    }
  }
}
contracts(false).then(() => contracts(true)).then(overlapping).then(lexicalBoot).then(switchedStoryUsage).then(() => {
  console.log('Chat usage: task isolation, once-only accounting, hosted charges, diagnostics, errors, concurrency and legacy fallback passed');
}).catch(error => { console.error(error); process.exitCode = 1; });

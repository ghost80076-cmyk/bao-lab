const assert = require('node:assert/strict');
const core = require('../js/memory-core.js');
const main = { type: 'gemini', protocol: 'gemini', model: 'main', baseUrl: 'https://main.test', key: 'main-secret' };
const helper = { type: 'custom', protocol: 'openai', model: 'future-model', baseUrl: 'https://helper.test', key: 'helper-secret',
  capabilities: { contextWindowTokens: 8192, maxOutputTokens: 2048 } };
const story = { api: main, memory: { summaryApiMode: 'same', summaryApi: helper, maxContext: 1000 } };
assert.equal(core.resolve(story).model, 'main', 'same mode ignores stale helper settings and model names');
story.memory.summaryApiMode = 'separate';
const selected = core.config(story, 'summary', [], { maxOutputTokens: 16000 });
assert.equal(selected.protocol, 'openai');
assert.equal(selected.key, 'helper-secret');
assert.equal(selected.maxOutputTokens, 2048, 'explicit model capability caps the requested task budget');
assert.equal(selected.__memoryRequestedOutput, 16000);
assert.equal(core.config({ api: { ...helper, model: 'another-model', capabilitiesSource: { model: helper.model, baseUrl: helper.baseUrl, protocol: helper.protocol } } }, 'summary').maxOutputTokens, 8192,
  'switching models must not inherit the previous discovered capability limits');
assert.equal(core.inputLimit(selected), 8192 - 2048 - 819);
assert.equal(core.config({ api: main, memory: { maxContext: 1000 } }, 'summary').maxOutputTokens, 8192,
  'fifth-step pressure threshold is independent from output budget');
assert.throws(() => core.resolve({ api: main, memory: { summaryApiMode: 'separate', summaryApi: { ...helper, key: main.key } } }), /自己的 Key/);
assert.throws(() => core.resolve({ api: main, memory: { summaryApiMode: 'separate' } }), /尚未設定完成/);
const sparse = core.resolve({ api: main, memory: { summaryApi: { model: 'helper', baseUrl: helper.baseUrl, key: helper.key } } });
assert.equal(sparse.protocol, 'openai', 'sparse routes cannot inherit a different provider protocol');
const profiles = [{ model: main.model, base_url: main.baseUrl, memory_policy: { outputTokens: { summary: 16384 }, thinking: { thinkingLevel: 'low' } } }];
assert.equal(core.config({ api: main }, 'summary', profiles).maxOutputTokens, 16384);
assert.equal(core.config({ api: { ...main, baseUrl: helper.baseUrl } }, 'summary', profiles).maxOutputTokens, 8192,
  'matching model name on another endpoint cannot inherit a profile');
const cfg = core.config({ api: { ...helper, capabilities: { contextWindowTokens: 16000, maxOutputTokens: 2048 }, memory_policy: { inputTokens: 1800 } } }, 'notes');
const messages = (chunk, summary = '') => [{ role: 'system', content: 'Keep only observed facts.' }, { role: 'user', content: summary + '\nSOURCE\n' + chunk }];
assert.ok(core.sourceBudget(cfg, messages('', '舊摘要'.repeat(50))) < core.sourceBudget(cfg, messages('')));
const source = ('甲乙🙂\\"\n\n結果。'.repeat(1500));
let pending = source, reconstructed = '';
while (pending) {
  const chunk = core.prefix(pending, 113);
  assert.ok(core.tokens(chunk) <= 113);
  assert.doesNotMatch(chunk, /[\uD800-\uDBFF]$/);
  reconstructed += chunk; pending = pending.slice(chunk.length);
}
assert.equal(reconstructed, source, 'splitting must preserve every character and complete surrogate pairs');
assert.throws(() => core.mergeBatch({ ...cfg, __memoryInputTokens: 1 }, ['a'], items => messages(items.join(''))), /超出模型預算/);

(async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const sandbox = { URL, App: {}, MutationObserver: class { observe() {} },
    document: { createElement: () => ({}), getElementById: () => null, querySelector: () => null, head: { append() {} }, body: {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/model-discovery.js'), 'utf8'), sandbox);
  const discovery = sandbox.BAOModelDiscovery;
  const modelRoute = { model: 'not-yet-released-model', protocol: 'openai', baseUrl: 'https://metadata.test/v1/chat/completions', key: 'discovery-secret' };
  await discovery.fetchModels(modelRoute, async () => ({ ok: true, json: async () => ({ data: [{ id: modelRoute.model, context_length: 16000, top_provider: { max_completion_tokens: 2048 } }] }) }));
  assert.equal(discovery.capabilitiesFor(modelRoute).maxOutputTokens, 2048);
  assert.equal(discovery.capabilitiesFor({ ...modelRoute, baseUrl: 'https://other.test/v1/chat/completions' }).maxOutputTokens, undefined);
  const google = discovery.modelCapabilities({ inputTokenLimit: 32000, outputTokenLimit: 4096 });
  assert.equal(google.maxInputTokens, 32000);
  assert.equal(google.contextWindowTokens, undefined, 'a Gemini input limit is not a combined context-window limit');
  global.BAOModelDiscovery = discovery;
  assert.equal(core.config({ api: modelRoute }, 'notes').maxOutputTokens, 2048, 'provider-reported capabilities work without a model-name special case');
  delete global.BAOModelDiscovery;
  assert.ok(!JSON.stringify(discovery.capabilitiesFor(modelRoute)).includes('discovery-secret'));
  let checkpoint = {}, sends = 0;
  const submitted = [];
  const run = extra => core.foldText({ source, config: cfg, checkpoint, makeMessages: messages,
    send: async (config, payload) => {
      assert.ok(core.fits(config, payload));
      sends++; submitted.push(payload[1].content.split('\nSOURCE\n')[1]);
      if (sends === 2) throw new Error('network loss');
      return { text: 'verified summary', finishReason: 'stop' };
    }, normalize: result => result.text,
    save: value => { checkpoint = structuredClone(value); }, ...extra });
  await assert.rejects(run(), /network loss/);
  assert.ok(checkpoint.offset > 0 && checkpoint.offset < source.length);
  const paid = structuredClone(checkpoint), savedSource = submitted[0];
  submitted.length = 0;
  // Resume after persistence/reload, bounded to two requests in this invocation.
  const partial = await run({ maxCalls: 2 });
  assert.equal(partial.complete, false);
  assert.equal(checkpoint.completed, paid.completed + 2);
  assert.ok(!submitted.includes(savedSource), 'resuming must not rebill previously completed source');
  while (checkpoint.offset < source.length) await run();
  assert.equal(checkpoint.offset, source.length);
  let writes = 0;
  await assert.rejects(core.foldText({ source: 'fresh input', config: cfg, makeMessages: messages,
    send: async () => ({ text: 'valid-looking JSON', finishReason: 'length' }), normalize: r => r.text,
    save: () => writes++ }), /截斷/);
  assert.equal(writes, 0);
  let current = true;
  await assert.rejects(core.request(cfg, messages('source'), async () => { current = false; return { text: 'late result' }; }, { isCurrent: () => current }), /故事或整理來源已變更/);
  let calls = 0;
  await assert.rejects(core.request(cfg, messages('超長'.repeat(10000)), async () => calls++), /尚未送出/);
  assert.equal(calls, 0, 'oversized instructions/source must fail before provider invocation');
  console.log('Memory orchestration: model-independent capabilities, route isolation, budget subtraction, lossless chunking, persisted resume, bounded calls and stale-result protection passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

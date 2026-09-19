const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const presets = JSON.parse(fs.readFileSync(path.join(root, 'data', 'presets', 'models.json'), 'utf8'));
assert.ok(Array.isArray(presets) && presets.length >= 20, 'expected expanded model preset catalog');

const ids = presets.filter(x => x.model).map(x => `${x.provider}:${x.model}`);
assert.equal(new Set(ids).size, ids.length, 'provider + model presets should be unique');

const requirePreset = (provider, model) => {
  const p = presets.find(x => x.provider === provider && x.model === model);
  assert.ok(p, `missing ${provider}:${model}`);
  assert.ok(p.protocol, `${model} missing protocol`);
  assert.ok(p.base_url, `${model} missing base URL`);
  return p;
};

// The free route must be a separate, discoverable provider, not a paid-model default.
const free = requirePreset('openrouter-free', 'openrouter/free');
assert.equal(presets[0], free, 'free trial should be the first API service option');
assert.equal(free.provider_label, 'OpenRouter 免費體驗');
assert.equal(free.route, 'router');
assert.equal(free.protocol, 'openai');
assert.equal(free.base_url, 'https://openrouter.ai/api/v1/chat/completions');
assert.deepEqual([free.pricing.input, free.pricing.output, free.pricing.cache], [0, 0, 0]);
assert.match(free.docs_url, /^https:\/\/openrouter\.ai\/openrouter\/free/);
assert.match(free.pricing.note, /50.*1,000.*20/, 'free quotas must be shown as limits, not unlimited usage');
assert.match(free.use_case, /記憶.*狀態.*付費/, 'warn when helper models might still cost money');

const sonnet = requirePreset('anthropic', 'claude-sonnet-4-6');
assert.deepEqual([sonnet.pricing.input, sonnet.pricing.output, sonnet.pricing.cache], [3, 15, 0.3]);
const mimo = requirePreset('mimo', 'mimo-v2.5');
assert.equal(mimo.pricing.cache, 0.0028);
const qwen = requirePreset('qwen', 'qwen3.7-flash');
assert.equal(qwen.pricing.input, 0.03);
const deepseek = requirePreset('deepseek', 'deepseek-v4-flash');
assert.equal(deepseek.pricing.cache, 0.007);
requirePreset('minimax', 'MiniMax-M3');
requirePreset('gemini', 'gemini-3.1-pro-preview');
requirePreset('gemini', 'gemini-3-flash-preview');
requirePreset('openrouter', 'qwen/qwen3.7-flash');
requirePreset('openrouter', 'deepseek/deepseek-v4-flash-0731');

const zai = presets.find(x => x.provider === 'zai');
assert.ok(zai, 'missing Z.AI official provider');
assert.equal(zai.provider_label, 'Z.AI / GLM 官方');
assert.equal(zai.route, 'official');
assert.equal(zai.protocol, 'openai');
assert.equal(zai.model, '', 'Z.AI provider must not hardcode one GLM model');
assert.equal(zai.base_url, 'https://api.z.ai/api/paas/v4/chat/completions');
assert.equal(zai.cache, 'automatic');
assert.equal(zai.pricing, null, 'Z.AI volatile pricing must not be hardcoded');
assert.match(zai.docs_url, /^https:\/\/docs\.z\.ai\//);

const routingSource = fs.readFileSync(path.join(root, 'js/model-routing.js'), 'utf8');
assert.equal(routingSource.includes('filter(p => p.model && p.base_url'), false, 'helper providers with user-entered model IDs must not be filtered out');
assert.equal(routingSource.includes('filter(p => p.base_url && p.route !== "custom")'), true, 'helper provider presets should allow official endpoints without a fixed model');
assert.equal(routingSource.includes('type: presetEndpointMatches ? (preset.provider || "custom") : "custom"'), true, 'helper route must retain provider identity');
assert.equal(routingSource.includes('preset.provider === api.type'), true, 'restored helpers must recover their provider preset');

for (const file of ['js/model-routing.js', 'js/helper-api-routing.js', 'js/model-guide.js']) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(code, { filename: file });
}

console.log(`model presets core test passed (${presets.length} presets)`);

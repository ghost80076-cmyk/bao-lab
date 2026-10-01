const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'presets', 'models.json'), 'utf8'));

assert.equal(registry.schema, 'bao-model-registry/v1');
assert.equal(registry.version, 1);
assert.ok(Array.isArray(registry.models) && registry.models.length >= 15, 'expected logical model registry');

const modelIds = registry.models.map(model => model.id);
assert.equal(new Set(modelIds).size, modelIds.length, 'logical model ids must be unique');

for (const model of registry.models) {
  assert.ok(model.id && model.name, 'every logical model needs id and name');
  assert.ok(Array.isArray(model.routes) && model.routes.length, `${model.id} missing routes`);
  const routeIds = model.routes.map(route => route.id);
  assert.equal(new Set(routeIds).size, routeIds.length, `${model.id} route ids must be unique`);
  for (const route of model.routes) {
    assert.ok(route.provider, `${model.id} route missing provider`);
    assert.notEqual(route.provider, 'openrouter-free', 'free route must be folded into OpenRouter provider');
  }
}

const requireModel = id => {
  const model = registry.models.find(item => item.id === id);
  assert.ok(model, `missing logical model ${id}`);
  return model;
};
const requireRoute = (id, routeId) => {
  const model = requireModel(id);
  const route = model.routes.find(item => item.id === routeId);
  assert.ok(route, `missing ${id} route ${routeId}`);
  return route;
};

const freeModel = registry.models[0];
assert.equal(freeModel.id, 'openrouter-free', 'free model should stay first in the catalog');
const free = requireRoute('openrouter-free', 'openrouter');
assert.equal(free.provider, 'openrouter');
assert.equal(free.provider_label, 'OpenRouter');
assert.equal(free.model, 'openrouter/free');
assert.equal(free.route, 'router');
assert.equal(free.protocol, 'openai');
assert.equal(free.base_url, 'https://openrouter.ai/api/v1/chat/completions');
assert.deepEqual([free.pricing.input, free.pricing.output, free.pricing.cache], [0, 0, 0]);
assert.match(free.docs_url, /^https:\/\/openrouter\.ai\/openrouter\/free/);
assert.match(free.pricing.note, /50.*1,000.*20/, 'free quotas must be shown as limits, not unlimited usage');
assert.match(free.use_case, /記憶.*狀態.*付費/, 'warn when helper models might still cost money');

const geminiProOfficial = requireRoute('gemini-3.1-pro', 'google-official');
assert.equal(geminiProOfficial.provider, 'gemini');
assert.equal(geminiProOfficial.model, 'gemini-3.1-pro-preview');
const geminiProRouter = requireRoute('gemini-3.1-pro', 'openrouter');
assert.equal(geminiProRouter.provider, 'openrouter');
assert.equal(geminiProRouter.model, 'google/gemini-3.1-pro-preview');

const sonnet = requireRoute('claude-sonnet-4.6', 'anthropic-official');
assert.deepEqual([sonnet.pricing.input, sonnet.pricing.output, sonnet.pricing.cache], [3, 15, 0.3]);

const haiku45 = requireRoute('claude-haiku-4.5', 'anthropic-official');
assert.deepEqual([haiku45.pricing.input, haiku45.pricing.output, haiku45.pricing.cache], [1, 5, 0.1]);
assert.equal(requireRoute('claude-haiku-4.5', 'openrouter').model, 'anthropic/claude-haiku-4.5');

const sonnet5 = requireRoute('claude-sonnet-5', 'anthropic-official');
assert.deepEqual([sonnet5.pricing.input, sonnet5.pricing.output, sonnet5.pricing.cache], [2, 10, 0.2]);
assert.equal(requireRoute('claude-sonnet-5', 'openrouter').model, 'anthropic/claude-sonnet-5');

const gptLuna = requireRoute('gpt-5.6-luna', 'openai-official');
assert.equal(gptLuna.model, 'gpt-5.6-luna');
assert.deepEqual([gptLuna.pricing.input, gptLuna.pricing.output, gptLuna.pricing.cache], [0.2, 1.2, 0.02]);
assert.equal(requireRoute('gpt-5.6-luna', 'openrouter').model, 'openai/gpt-5.6-luna');

const grok45 = requireRoute('grok-4.5', 'xai-official');
assert.equal(grok45.protocol, 'openai');
assert.equal(grok45.model, 'grok-4.5');
assert.deepEqual([grok45.pricing.input, grok45.pricing.output, grok45.pricing.cache], [2, 6, 0.3]);
assert.equal(requireRoute('grok-4.5', 'openrouter').model, 'x-ai/grok-4.5');
assert.equal(requireRoute('mimo-v2.5', 'mimo-official').pricing.cache, 0.0028);
assert.equal(requireRoute('qwen-3.7-flash', 'qwen-official').pricing.input, 0.03);
assert.equal(requireRoute('deepseek-v4-flash-0731', 'deepseek-official').pricing.cache, 0.007);
assert.equal(requireRoute('minimax-m3', 'minimax-official').model, 'MiniMax-M3');

const zai = requireRoute('zai-custom', 'zai-official');
assert.equal(zai.provider_label, 'Z.AI / GLM 官方');
assert.equal(zai.route, 'official');
assert.equal(zai.protocol, 'openai');
assert.equal(zai.model, '', 'Z.AI provider must not hardcode one GLM model');
assert.equal(zai.base_url, 'https://api.z.ai/api/paas/v4/chat/completions');
assert.equal(zai.cache, 'automatic');
assert.equal(zai.pricing, null, 'Z.AI volatile pricing must not be hardcoded');

const hosted = registry.models.filter(model => model.hosted).sort((a, b) => a.hosted.order - b.hosted.order);
assert.equal(hosted.length, 13, 'expected thirteen curated YoruBay hosted models');
const hostedResolved = hosted.map(model => {
  const route = model.routes.find(item => item.id === model.hosted.route_id);
  assert.ok(route, `${model.id} hosted route must resolve inside the same logical model`);
  assert.ok(route.model, `${model.id} hosted route needs a concrete model id`);
  return { id: model.id, provider: route.provider, model: route.model };
});
assert.deepEqual(hostedResolved, [
  { id: 'deepseek-v4-flash-0731', provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' },
  { id: 'qwen-3.7-flash', provider: 'openrouter', model: 'qwen/qwen3.7-flash' },
  { id: 'mimo-v2.5', provider: 'openrouter', model: 'xiaomi/mimo-v2.5' },
  { id: 'gemini-3-flash', provider: 'gemini', model: 'gemini-3-flash-preview' },
  { id: 'minimax-m3', provider: 'openrouter', model: 'minimax/minimax-m3' },
  { id: 'gpt-5.6-luna', provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  { id: 'grok-4.5', provider: 'openrouter', model: 'x-ai/grok-4.5' },
  { id: 'gemini-3.1-pro', provider: 'gemini', model: 'gemini-3.1-pro-preview' },
  { id: 'claude-haiku-4.5', provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' },
  { id: 'claude-sonnet-4.5', provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
  { id: 'claude-sonnet-5', provider: 'openrouter', model: 'anthropic/claude-sonnet-5' },
  { id: 'claude-sonnet-4.6', provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' },
  { id: 'claude-opus-4.6', provider: 'openrouter', model: 'anthropic/claude-opus-4.6' }
], 'hosted list should preserve existing choices and add mainstream provider options');

const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
assert.match(appSource, /modelRegistry:\s*null/);
assert.match(appSource, /flattenModelRegistry\(registry\)/);
assert.match(appSource, /route\?\.byok!==false/);
assert.match(appSource, /this\.modelRegistry=Array\.isArray\(registry\)\?null:registry/);

const creditsSource = fs.readFileSync(path.join(root, 'js/credits-pilot.js'), 'utf8');
assert.equal(creditsSource.includes('MODEL_PROVIDERS'), false, 'hosted provider map must come from the registry');
assert.equal(creditsSource.includes('const PRESETS = ['), false, 'hosted preset list must come from the registry');
assert.match(creditsSource, /hostedEntries/);
assert.match(creditsSource, /model\.hosted/);

const routingSource = fs.readFileSync(path.join(root, 'js/model-routing.js'), 'utf8');
assert.equal(routingSource.includes('filter(p => p.model && p.base_url'), false, 'helper providers with user-entered model IDs must not be filtered out');
assert.equal(routingSource.includes('filter(p => p.base_url && p.route !== "custom")'), true, 'helper provider presets should allow official endpoints without a fixed model');
assert.equal(routingSource.includes('type: presetEndpointMatches ? (preset.provider || "custom") : "custom"'), true, 'helper route must retain provider identity');
assert.equal(routingSource.includes('preset.provider === api.type'), true, 'restored helpers must recover their provider preset');

for (const file of ['js/app.js', 'js/credits-pilot.js', 'js/model-routing.js', 'js/helper-api-routing.js', 'js/model-guide.js']) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(code, { filename: file });
}

const byokRoutes = registry.models.flatMap(model => model.routes.filter(route => route.byok !== false));
console.log(`model registry core test passed (${registry.models.length} models / ${byokRoutes.length} BYOK routes / ${hosted.length} hosted)`);

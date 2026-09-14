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

for (const file of ['js/model-routing.js', 'js/helper-api-routing.js', 'js/model-guide.js']) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(code, { filename: file });
}

console.log(`model presets core test passed (${presets.length} presets)`);

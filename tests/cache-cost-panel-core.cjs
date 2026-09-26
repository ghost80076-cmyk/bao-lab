const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
global.Chat = {
  renderTurnUsage() {}, renderUsage() {}, reset() {},
  usage: { cached: 0, cachedUnknown: false }
};
global.App = { config: { api: { type: 'gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.5-flash' } } };
global.GameState = { current: {} };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cache-cost-panel.js'), 'utf8'), { filename: 'js/cache-cost-panel.js' });
const panel = global.BAOCacheCostPanel;
assert.ok(panel, 'cache dashboard must be exported');
assert.equal(panel.describeCache(App.config.api).gemini, true);
assert.equal(panel.describeCache({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages' }).gemini, false);
assert.match(panel.describeCache({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' }).mode, /模型/);
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: 8000 }, { inputPerMillion: 2, cachePerMillion: 0.2 }), 0.0144);
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: null }, { inputPerMillion: 2, cachePerMillion: 0.2 }), null);
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: 8000 }, { inputPerMillion: 2, cachePerMillion: 0 }), null, 'an unconfigured cache price must not imply a free cache');
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: 12000 }, { inputPerMillion: 2, cachePerMillion: 0.2 }), null, 'invalid provider usage must not be estimated');
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: 8000 }, { inputPerMillion: 0, cachePerMillion: 0.2 }), null);
assert.equal(panel.estimateDifference({ input_tokens: 10000, cached_tokens: 8000 }, { inputPerMillion: 0.2, cachePerMillion: 2 }), null);
console.log('cache cost panel core test passed');

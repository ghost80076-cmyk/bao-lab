const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const cfg = { type: 'gemini', protocol: 'gemini', key: 'test-key', model: 'gemini-3.1-pro-preview', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models' };
const messages = [{ role: 'system', content: 'Fixed rules' }, { role: 'user', content: 'Story turn' }];
const elements = { 'bao-gemini-cache-ttl': { value: '30' }, 'bao-gemini-cache-status': {} };
let requests = [], regular = [];
const ctx = {
  console, URL, TextEncoder, crypto: webcrypto, Date, confirm: () => true,
  document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] || null },
  GameState: { current: {} },
  App: { config: { api: cfg, memory: { cache: true } }, async buildMessages() { return messages; } },
  API: {
    contentToText: x => x, shouldStream: () => false, normalizeUsage: x => x,
    readJSON: async r => r.json(), geminiEmptyResponseMessage: () => 'Empty',
    async sendGemini(config) { regular.push(config); return { text: 'regular', finishReason: 'STOP' }; }
  },
  async fetch(url, options) {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith(':countTokens')) return { ok: true, json: async () => ({ totalTokens: 5000 }) };
    if (url.endsWith('/cachedContents')) return { ok: true, json: async () => ({ name: 'cachedContents/test', expireTime: new Date(Date.now() + 60000).toISOString() }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Partial' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { totalTokenCount: 6000 } }) };
  }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/gemini-explicit-cache.js'), 'utf8'), ctx);
(async () => {
  await ctx.BAOGeminiExplicitCache.inspect();
  await ctx.BAOGeminiExplicitCache.create();
  assert.equal(requests.length, 2);
  const result = await ctx.API.sendGemini(cfg, messages);
  assert.equal(requests.at(-1).body.cachedContent, 'cachedContents/test');
  assert.equal(result.finishReason, 'MAX_TOKENS');
  const before = requests.length;
  await ctx.API.sendGemini({ ...cfg, __stateTask: true }, messages);
  await ctx.API.sendGemini({ ...cfg, __memoryTask: true }, messages);
  assert.equal(requests.length, before, 'helpers must use normal transport with thinking and schema controls');
  assert.equal(regular.length, 2);
  assert.equal(regular[0].__stateTask, true);
  messages[0].content = 'Changed rules';
  await ctx.API.sendGemini(cfg, messages);
  assert.equal(regular.length, 3, 'changed prompt must not reuse stale explicit cache');
  console.log('Gemini explicit cache core test passed');
})().catch(e => { console.error(e); process.exitCode = 1; });

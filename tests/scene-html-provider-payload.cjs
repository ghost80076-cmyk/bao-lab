const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const requests = [];
const fetch = async (url, options) => {
  requests.push({ url, body: JSON.parse(options.body) });
  return { ok: true, status: 200, async text() { return JSON.stringify({ choices: [{ message: { content: 'OK' } }], content: [{ text: 'OK' }], candidates: [{ content: { parts: [{ text: 'OK' }] } }] }); } };
};
const sandbox = { fetch, URL, AbortController, TextDecoder, window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/api.js', 'utf8') + '\nthis.api = API;', sandbox);
const api = sandbox.api;
const template = '<div class="status">AUTHOR_TEMPLATE_SENTINEL {{time}}</div>';
const historical = '<div class="scene">HISTORY_MARKUP_SENTINEL</div><p>角色打開門，交給玩家一封信。</p>';
const messages = [
  { role: 'system', content: '角色設定與故事規則' },
  { role: 'assistant', content: historical },
  { role: 'user', content: '繼續故事' }
];
const config = { model: 'test-model', key: 'TEST_KEY', baseUrl: 'https://example.test/v1/chat/completions' };
(async () => {
  for (const protocol of ['openai', 'anthropic', 'gemini']) {
    requests.length = 0;
    try { await api.send({ ...config, protocol }, messages); } catch (error) {
      // Fake responses may not match every provider's response shape; payload capture happens first.
      assert.ok(requests.length, `${protocol}: request was not sent: ${error.message}`);
    }
    assert.equal(requests.length, 1, `${protocol}: expected one request`);
    const payload = JSON.stringify(requests[0].body);
    assert.ok(!payload.includes('AUTHOR_TEMPLATE_SENTINEL'), `${protocol}: local author template leaked`);
    assert.ok(payload.includes('角色打開門，交給玩家一封信'), `${protocol}: narrative content was lost`);
    assert.ok(payload.includes('HISTORY_MARKUP_SENTINEL'), `${protocol}: historical markup transmission changed; update regression expectations`);
    assert.ok(!payload.includes('TEST_KEY'), `${protocol}: key leaked into request body`);
  }
  assert.ok(template.includes('AUTHOR_TEMPLATE_SENTINEL'));
  console.log('PASS: captured OpenAI-compatible, Anthropic, and Gemini payloads without a paid API call. Author template stays local when omitted from messages; narrative survives.');
  console.log('KNOWN ISSUE: historical assistant HTML is still transmitted by all three provider paths. This test documents the baseline, not a fix.');
})().catch(error => { console.error(error); process.exitCode = 1; });

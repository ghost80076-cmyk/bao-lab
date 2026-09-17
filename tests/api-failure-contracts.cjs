const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
vm.runInThisContext(`${fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8')}\nglobalThis.__API = API;`, { filename: 'js/api.js' });
const API = global.__API;
const messages = [{ role: 'user', content: 'test' }];
const providers = [
  { type: 'custom', protocol: 'openai', baseUrl: 'https://example.test/v1/chat/completions' },
  { type: 'anthropic', protocol: 'anthropic', baseUrl: 'https://example.test/v1/messages' },
  { type: 'gemini', protocol: 'gemini', baseUrl: 'https://example.test/v1beta/models' }
];

(async () => {
  for (const provider of providers) {
    const config = { ...provider, key: 'LOCAL-TEST-ONLY', model: 'test-model' };
    const controller = new AbortController();
    let seenSignal;
    global.fetch = (_url, options) => {
      seenSignal = options.signal;
      return new Promise((_resolve, reject) => {
        if (options.signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    };
    const pending = API.send({ ...config, signal: controller.signal }, messages);
    assert.equal(seenSignal, controller.signal, `${provider.protocol} must pass the caller's cancellation signal to fetch`);
    controller.abort();
    await assert.rejects(pending, error => error.code === 'BAO_ABORTED', `${provider.protocol} must preserve cancellation semantics`);

    for (const [status, phrase] of [[401, /API Key/], [429, /額度|頻繁/]]) {
      global.fetch = async () => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: status === 401 ? 'invalid api key' : 'quota exceeded' } }) });
      await assert.rejects(API.send(config, messages), phrase, `${provider.protocol} HTTP ${status} must explain the failure`);
    }
  }
  console.log('API failure and cancellation contracts test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

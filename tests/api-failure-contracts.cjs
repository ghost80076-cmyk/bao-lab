const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
vm.runInThisContext(`${fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8')}\nglobalThis.__API = API;`, { filename: 'js/api.js' });
const API = global.__API;
const local = require('../js/lm-studio-core.js');
API.wrapSend('local-failure-contract', (next, config, messages) => local.isLocal(config) ? local.send(config, messages, API) : next(config, messages));
const messages = [{ role: 'user', content: 'test' }];
const providers = [
  { type: 'lmstudio', protocol: 'openai', baseUrl: 'http://localhost:1234/v1' },
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
      await assert.rejects(API.send(config, messages), provider.type === 'lmstudio' ? new RegExp(String(status)) : phrase, `${provider.protocol} HTTP ${status} must explain the failure`);
    }
  }
  global.addEventListener = () => {};
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8') + '\nglobalThis.__App = App;');
  const app = global.__App;
  // Successful HTTP/finish signals do not establish a usable story turn.
  for (const provider of providers) {
    for (const visible of ['', '   ']) {
      const body = provider.protocol === 'openai'
        ? { choices: [{ message: { content: visible }, finish_reason: 'stop' }], usage: { prompt_tokens: 7 } }
        : provider.protocol === 'anthropic'
          ? { content: [{ type: 'text', text: visible }], stop_reason: 'end_turn', usage: { input_tokens: 7 } }
          : { candidates: [{ content: { parts: [{ text: visible }, { thought: true, text: 'private reasoning' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 7 } };
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
      await assert.rejects(API.send({ ...provider, key: 'mock', model: 'mock' }, messages), error =>
        error.code === 'BAO_PROVIDER_EMPTY' && error.usage.input_tokens === 7 && !('text' in error));
      const input = { value: '玩家輸入' }, bubble = { innerHTML: '' };
      const stream = { insertAdjacentHTML() {}, lastElementChild: { remove() {} }, appendChild() {} };
      global.document = { getElementById: id => id === 'user-input' ? input : stream, createElement: () => bubble };
      global.GameState = { current: {}, addEvent() { throw new Error('empty reply must not advance world events'); } };
      const original = { id: 'original', role: 'assistant', content: '原始故事' };
      global.Chat = { messages: [original], add(role, content) {
        const message = { id: 'pending', role, content }; this.messages.push(message); return message;
      }, afterTurn() { throw new Error('empty reply must not run memory'); } };
      app.config = { api: { ...provider, key: 'mock', model: 'mock' } };
      app.buildMessages = async () => messages;
      app.renderStoryMessage = text => text;
      app.saveStory = () => { throw new Error('empty reply must not save'); };
      await app.sendMessage();
      assert.deepEqual(Chat.messages, [original], 'failed turn leaves original history unchanged');
      assert.equal(input.value, '玩家輸入', 'failed turn restores player input');
      assert.match(bubble.innerHTML, /模型沒有回傳可顯示/);

    }
  }
  console.log('API failure and cancellation contracts test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

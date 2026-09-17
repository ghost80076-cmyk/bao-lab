const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const storyA = {}, storyB = {};
const pending = [];
const guard = { title: '' };
global.window = global;
global.GameState = { current: storyA };
global.document = { getElementById: id => id === 'usage-guard' ? guard : null };
global.API = {
  isOpenRouter: () => false,
  send(config) {
    if (!config.__memoryTask) return Promise.resolve({ text: 'ordinary chat' });
    const request = deferred();
    pending.push({ config, request });
    return request.promise;
  }
};
global.Chat = {
  summary: '', summarizedUntil: 0,
  async context() { return []; },
  async maybeSummarize(config) {
    try { await API.send({ ...config, __memoryTask: true }, []); }
    catch (_) { /* Production summarizer also catches provider failures. */ }
  }
};
global.App = { config: { memory: {} }, buildSystemPrompt: () => '', getSelectedPreset: () => null };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'prompt-cache.js'), 'utf8'), { filename: 'js/prompt-cache.js' });

(async () => {
  const send = API.send;
  const first = Chat.maybeSummarize({});
  assert.equal(pending.length, 1);
  assert.equal(API.send, send, 'memory summarization must not replace the global sender');
  const duplicate = await Chat.maybeSummarize({});
  assert.equal(duplicate, undefined);
  assert.equal(pending.length, 1, 'same-story concurrent summaries are deduplicated');
  assert.equal((await API.send({}, [])).text, 'ordinary chat');
  assert.equal(API.send, send, 'ordinary requests must retain the stable sender');

  GameState.current = storyB;
  const second = Chat.maybeSummarize({});
  assert.equal(pending.length, 2, 'another story can summarize independently');
  pending[0].request.reject(new Error('quota exceeded'));
  await first;
  assert.equal(API.send, send);
  await Chat.maybeSummarize({});
  assert.equal(pending.length, 2, 'failed story A cannot block pending story B');
  GameState.current = storyA;
  await Chat.maybeSummarize({});
  assert.equal(pending.length, 2, 'quota failure puts only story A on cooldown');
  assert.match(guard.title, /暫停/);
  pending[1].request.resolve({ text: 'ok' });
  await second;
  GameState.current = storyB;
  const third = Chat.maybeSummarize({});
  assert.equal(pending.length, 3, 'story B remains eligible after story A fails');
  const controller = new AbortController();
  const aborted = API.send({ __memoryTask: true, signal: controller.signal }, []);
  assert.equal(pending.length, 4);
  controller.abort();
  assert.equal(pending[3].config.signal.aborted, true, 'caller cancellation propagates to provider signal');
  pending[3].request.reject(new Error('aborted'));
  await assert.rejects(aborted, /記憶整理請求失敗/);
  pending[2].request.resolve({ text: 'ok' });
  await third;
  assert.equal(API.send, send);
  console.log('memory request guard core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

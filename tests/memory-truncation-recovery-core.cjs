'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const sent = [];
  const warning = [];
  let ingestError = false;
  const ctx = vm.createContext({
    Date,
    console: { warn: (...args) => warning.push(args) },
    document: { getElementById: () => null },
    addEventListener() {}, setTimeout() {},
    GameState: { current: { memory: [], episodicMemory: { version: 1, events: ['keep-existing'] } } },
    BAOHelperData: { memoryRules: '', memoryText: v => v === 'GOOD' ? '已驗證的摘要' : '', parse: () => ({ episodes: [] }) },
    BAOEpisodicMemory: {
      updateContext: () => [],
      ingest: () => { if (ingestError) throw new Error('invalid episode payload'); }
    },
    App: { config: {}, activeCharacter: { id: 'test' }, buildSystemPrompt: () => '' },
    API: { async send(_config, messages) { sent.push(messages); return { text: 'GOOD' }; } }
  });
  ctx.window = ctx;
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/chat.js'), 'utf8');
  vm.runInContext(source + '\nwindow.Chat = Chat;', ctx, { filename: 'js/chat.js' });
  const chat = ctx.Chat;
  const config = { memory: { mode: 'smart', maxRounds: 4, summaryInterval: 2, summaryChunkChars: 4000 }, api: { key: 'mock-key', model: 'mock' } };
  const reset = () => { chat.reset(); ctx.GameState.current = { memory: [], episodicMemory: { version: 1, events: ['keep-existing'] } }; };
  const seed = (rounds, oversizeFirst = false) => {
    reset();
    chat.messages = [];
    for (let i = 1; i <= rounds; i++) {
      chat.messages.push({ id: 'u' + i, role: 'user', content: '第' + i + '輪：前往醫院的意圖' });
      const content = oversizeFirst && i === 1
        ? '故事結果：暫時未抵達醫院。' + '敘事'.repeat(2200)
        : i === 2 ? '故事結果：進入醫院但尚未就診。' + '敘事'.repeat(1976)
        : '故事結果：此輪仍在醫院附近。';
      chat.messages.push({ id: 'a' + i, role: 'assistant', content });
    }
  };
  return { ctx, chat, sent, warning, config, seed, reset, setIngestError(v) { ingestError = v; } };
}

(async () => {
  const s = setup(); s.seed(91);
  // Use uniform complete turns so every retry can shrink safely.
  s.chat.messages.forEach(m => m.content = '已觀察的劇情結果'.repeat(20));
  const calls = [];
  s.ctx.API.send = async (config, messages) => {
    calls.push({ config, text: messages.at(-1).content });
    return calls.length < 3 ? { text: 'partial', finishReason: 'MAX_TOKENS', usage: {output_tokens: 120} } : { text: 'GOOD', finishReason: 'STOP', usage: {output_tokens: 24} };
  };
  await s.chat.maybeSummarize(s.config, true);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.config.maxOutputTokens === 8192));
  assert.match(calls[0].text, /本次完整 JSON 輸出預算/);
  assert.match(calls[0].text, /episodes 與 knowledgeUpdates 各最多 4 筆/);
  assert.match(calls[1].text, /episodes 與 knowledgeUpdates 各最多 2 筆/);
  assert.equal(s.chat.memoryHealth.lastFinishReason, 'STOP');
  assert.equal(s.chat.memoryHealth.lastRequestedOutputTokens, 8192);
  assert.equal(s.chat.memoryHealth.lastOutputTokens, 24);
  assert.equal(s.chat.memoryHealth.lastAttempt, 3);
  assert.ok(calls[1].text.length < calls[0].text.length);
  assert.ok(calls[2].text.length < calls[1].text.length);
  assert.equal(s.chat.memoryHealth.phase, 'success');
  assert.equal(s.chat.messages[s.chat.summarizedUntil - 1].role, 'assistant');
  assert.equal(s.chat.messages.length, 182);
  const prior = s.chat.summarizedUntil;
  const summary = s.chat.summary;
  let failures = 0;
  s.ctx.API.send = async () => { failures++; return { text: 'partial', finishReason: 'LENGTH' }; };
  await s.chat.maybeSummarize(s.config, true);
  assert.ok(failures <= 3);
  assert.equal(s.chat.summarizedUntil, prior);
  assert.equal(s.chat.summary, summary);
  assert.equal(s.chat.memoryHealth.phase, 'failed');
  assert.equal(s.chat.memoryHealth.lastFinishReason, 'LENGTH');
  assert.equal(s.chat.memoryHealth.lastAttempt, 3);
  let blocked = 0;
  s.ctx.API.send = async () => { blocked++; return { finishReason: 'SAFETY' }; };
  await s.chat.maybeSummarize(s.config, true);
  assert.equal(blocked, 1, 'blocked content must not be retried');
  console.log('PASS memory truncation bounded recovery and history preservation');
})().catch(error => { console.error(error); process.exitCode = 1; });

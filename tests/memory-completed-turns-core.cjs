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
  for (const rounds of [40, 80, 120]) {
    const s = setup(); s.seed(rounds);
    await s.chat.maybeSummarize(s.config);
    assert.equal(s.sent.length, 1, rounds + ' rounds should require only one helper call for a bounded chunk');
    assert.equal(s.chat.summarizedUntil, 2, 'first summary must end on completed user+assistant exchange');
    const content = s.sent[0].at(-1).content;
    assert.match(content, /前往醫院的意圖/);
    assert.match(content, /故事結果：此輪仍在醫院附近/);
    assert.doesNotMatch(content, /第2輪：前往醫院的意圖/, 'unfinished next player action must not be summarized alone');
    assert.equal(s.chat.memoryHealth.phase, 'success');
    await s.chat.maybeSummarize(s.config);
    assert.ok(s.chat.summarizedUntil >= 4, 'next pass can safely consume previously deferred complete exchange');
    assert.equal(s.chat.messages.length, rounds * 2, 'source history must never be truncated');

    // If the first full user+assistant exchange exceeds budget, retain both
    // without falsely certifying the player's plan as completed.
    const stalled = setup(); stalled.seed(rounds, true);
    await stalled.chat.maybeSummarize(stalled.config);
    assert.equal(stalled.sent.length, 0, 'an oversized unmatched turn must not trigger a paid partial summary');
    assert.equal(stalled.chat.summarizedUntil, 0);
    assert.equal(stalled.chat.memoryHealth.phase, 'failed');
    assert.match(stalled.chat.memoryHealth.message, /原始對話會繼續保留/);
    const ctxMessages = await stalled.chat.context(stalled.config);
    assert.ok(ctxMessages.some(m => m.content.includes('暫時未抵達醫院')), 'smart memory retains unsummarized actual outcome');

    // A malformed optional episode-index response must never waste an
    // otherwise valid summary, nor discard an established event index.
    const badIndex = setup(); badIndex.seed(rounds); badIndex.setIngestError(true);
    await badIndex.chat.maybeSummarize(badIndex.config);
    assert.equal(badIndex.chat.summary, '已驗證的摘要', 'successful summary remains committed');
    assert.equal(badIndex.chat.summarizedUntil, 2);
    assert.equal(badIndex.chat.memoryHealth.phase, 'success');
    assert.match(badIndex.chat.memoryHealth.message, /事件索引暫時未更新/);
    assert.equal(badIndex.ctx.GameState.current.episodicMemory.events[0], 'keep-existing');
    assert.equal(badIndex.warning.length, 1);
  }

  console.log('PASS P1 40/80/120: completed-turn summary cursor, original outcome retention, optional index isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });

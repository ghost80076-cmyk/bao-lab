'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// P0: actual Chat.context -> cache-aware App.buildMessages -> orchestration.
// No LLM calls, no synthetic "one paragraph pretending to be 120 turns".
const app = {
  config: {
    api: { model: 'mock-llm', type: 'lmstudio' },
    memory: { mode: 'rounds', maxRounds: 20, maxContext: 32000, summaryInterval: 4, cache: false }
  },
  activeCharacter: { id: 'p0-hospital-transition' },
  buildSystemPrompt() {
    return '【角色核心】\n保持連續劇情。\n\n【目前核心狀態】\n時間：02:16\n地點：公寓';
  },
  getSelectedPreset() { return null; },
  wrapBuildMessages(id, wrapper) {
    this.__wrappers ||= new Set();
    if (this.__wrappers.has(id)) return false;
    const previous = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper.call(this, previous, ...args);
    this.__wrappers.add(id);
    return true;
  }
};
const ctx = vm.createContext({
  console, App: app, API: { isOpenRouter: () => false },
  GameState: { current: null },
  document: { getElementById: () => null, querySelector: () => null, head: null },
  setTimeout() {}
});
ctx.window = ctx;
ctx.addEventListener = () => {};
const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file });
run('js/chat.js');
vm.runInContext('window.Chat = Chat', ctx);
run('js/prompt-cache.js');
run('js/prompt-orchestrator.js');

const chat = ctx.Chat;
const latestContent = result => result.at(-1).content;
const count = (text, needle) => text.split(needle).length - 1;
const seed = (rounds, sceneRound) => {
  chat.reset();
  chat.lastStoryPromptTokens = 31000; // critical: recent rounds drop to five
  ctx.GameState.current = {
    time: '02:16', location: '公寓',
    stateTracker: { phase: 'failed' }, pendingStateTurns: [{ player: '轉場發生', assistant: '狀態 JSON 未完成' }]
  };
  for (let n = 1; n <= rounds; n++) {
    chat.add('user', '第' + n + '輪行動');
    chat.add('assistant', n === sceneRound
      ? '我們已經抵達醫院急診室，完成掛號並等待醫師檢查。'
      : '第' + n + '輪的正常故事正文');
  }
  chat.add('user', '接下來呢？');
};

(async () => {
  let cacheablePrefix = '';
  for (const rounds of [40, 80, 120]) {
    seed(rounds, rounds - 7);
    const request = await app.buildMessages(app.config);
    const last = latestContent(request);
    assert.match(last, /【狀態延遲｜近期劇情原文】/, rounds + '-round fixed context must flag stale state');
    assert.match(last, /醫院急診室/, rounds + '-round fixed context must reintroduce omitted hospital transition');
    assert.equal(count(request.map(m => m.content).join('\n'), '醫院急診室'), 1,
      rounds + '-round request should not duplicate the same already delivered event');
    assert.match(last, /接下來呢？/);
    assert.equal(chat.turnCount(), rounds + 1, 'all original player turns stay saved locally');
    assert.equal(ctx.GameState.current.location, '公寓', 'building a prompt must not hallucinate or mutate live state');
    if (cacheablePrefix) assert.equal(request[0].content, cacheablePrefix, 'cacheable system prefix stays stable');
    else cacheablePrefix = request[0].content;

    // Normal fixed rounds already contain this scene. Injecting it again would
    // add cost without resolving any missing-context problem.
    chat.lastStoryPromptTokens = 0;
    const normal = await app.buildMessages(app.config);
    assert.doesNotMatch(latestContent(normal), /【狀態延遲｜近期劇情原文】/,
      'no redundant continuity input when the normal window contains the scene');

    // Full history and smart mode with no completed summary must not silently
    // discard the raw hospital scene, even if helper/status updates failed.
    app.config.memory.mode = 'full';
    const full = await app.buildMessages(app.config);
    assert.doesNotMatch(latestContent(full), /【狀態延遲｜近期劇情原文】/,
      'full context never needs duplicated source');
    assert.ok(full.some(m => m.role === 'assistant' && m.content.includes('醫院急診室')));

    app.config.memory.mode = 'smart';
    chat.summary = '';
    chat.summarizedUntil = 0;
    chat.memoryHealth = { phase: 'failed', message: '摘要失敗' };
    chat.lastStoryPromptTokens = 31000;
    const smartFailed = await app.buildMessages(app.config);
    assert.ok(smartFailed.some(m => m.role === 'assistant' && m.content.includes('醫院急診室')),
      'smart mode preserves unsummarized original events under pressure');
    assert.doesNotMatch(latestContent(smartFailed), /【狀態延遲｜近期劇情原文】/,
      'smart fallback uses retained original messages, not another copy');

    chat.summary = '已經離開公寓並抵達醫院；等待診療。';
    chat.summarizedUntil = chat.messages.length - 16;
    const smartCovered = await app.buildMessages(app.config);
    assert.ok(smartCovered.some(m => m.role === 'system' && m.content.includes('已經離開公寓')),
      'successful smart summary carries prior scene');
    assert.doesNotMatch(latestContent(smartCovered), /【狀態延遲｜近期劇情原文】/,
      'no duplicated evidence when recent scene already in smart raw context');

    app.config.memory.mode = 'rounds';
  }

  // {} returned by the model can be reported as unchanged even though narration
  // crossed the street. Use a smaller source-only fallback for this condition.
  seed(40, 34);
  ctx.GameState.current.stateTracker.phase = 'unchanged';
  ctx.GameState.current.pendingStateTurns = [];
  const unchanged = await app.buildMessages(app.config);
  assert.match(latestContent(unchanged), /醫院急診室/,
    'after an empty PATCH, the last missing scene must still be available');
  assert.ok(ctx.BAOPromptOrchestrator.recentContinuityEvidence(unchanged).length <= 500,
    'unchanged-state proof must be small and zero if assembled request already includes it');

  ctx.GameState.current.stateTracker.phase = 'updated';
  const healthy = await app.buildMessages(app.config);
  assert.doesNotMatch(latestContent(healthy), /【狀態延遲｜近期劇情原文】/,
    'healthy state must avoid the fallback and its token expense');

  console.log('PASS P0 40/80/120: trimmed fixed rounds, smart summary failure, full history, unchanged PATCH, stable cache prefix and no duplicate context');
})().catch(error => { console.error(error); process.exitCode = 1; });

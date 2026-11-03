'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const fault = process.argv.find(arg => arg.startsWith('--fault='))?.slice(8);

async function run() {
  let calls = 0;
  const browserValues = new Map();
  const ctx = {
    console, structuredClone, AbortController, DOMException, setTimeout() {}, clearTimeout() {}, addEventListener() {},
    document: { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
      createElement() { return {}; }, head: { appendChild() {} }, addEventListener() {} },
    localStorage: { getItem: key => browserValues.get(key) ?? null,
      setItem: (key, value) => browserValues.set(key, String(value)), removeItem: key => browserValues.delete(key) },
    GameState: { current: { npcs: [{ npc_id: 'erin', name: '艾琳', aliases: ['琳'], presence: 'away' }] } },
    API: { isOpenRouter() { return false; }, async send(api) {
      assert.equal(api.__memoryTask, true, 'only the normal automatic-summary transport may run');
      calls++;
      return { finishReason: 'STOP', text: JSON.stringify({ events: [
        `共享摘要7001版本${calls}。`, '私密摘要7003。', '排除摘要7002。'
      ] }) };
    } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = name => vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), ctx, { filename: name });
  for (const name of ['helper-data', 'memory-core', 'episodic-memory-core', 'summary-knowledge-core', 'chat', 'app', 'story-maintenance-lock']) load(name);
  vm.runInContext('window.Chat=Chat;window.App=App;', ctx);
  // Exercise real payload/sanitization/restore methods. Database bootstrap is
  // excluded here; IndexedDB durability has its own persistence/browser suites.
  const storage = fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8');
  assert.equal(storage.split('Storage.init();').length, 2);
  vm.runInContext(storage.replace('Storage.init();', 'window.Storage=Storage;'), ctx, { filename: 'storage' });
  ctx.App.config = { narrativeMode: 'immersive', api: { key: 'mock', model: 'mock' }, persona: { name: '旅人' },
    memory: { mode: 'smart', maxRounds: 4, summaryInterval: 4, episodicRecall: false } };
  ctx.App.activeCharacter = { id: 'longplay', name: '艾琳' };
  ctx.App.characters = [ctx.App.activeCharacter];
  ctx.App.buildSystemPrompt = () => 'FIXED';
  ctx.App.saveStory = () => true;
  ctx.App.renderChatShell = () => {};
  ctx.Chat.renderGuard = () => {};
  ctx.Chat.messages = [{ id: 'seed-u', role: 'user', content: '起點原文。' }, { id: 'seed-a', role: 'assistant', content: '起點回應。' }];
  ctx.Chat.summary = '共享摘要7001版本0。私密摘要7003。排除摘要7002。';
  ctx.Chat.summarizedUntil = 2;
  load('story-tools'); load('prompt-cache');
  if (fault === 'raw') {
    const next = ctx.Chat.context.bind(ctx.Chat);
    ctx.Chat.context = async (...args) => (await next(...args)).filter(message => message.role === 'system');
  }
  if (fault === 'scope') {
    const next = ctx.App.buildMessages.bind(ctx.App);
    ctx.App.buildMessages = async (...args) => [...await next(...args), { role: 'system', content: '排除摘要7002。' }];
  }
  const core = ctx.BAOSummaryKnowledgeCore;
  const approve = () => {
    const owner = ctx.GameState.current;
    const draft = core.draft({ summary: ctx.Chat.summary, cursor: ctx.Chat.summarizedUntil, messages: ctx.Chat.messages });
    owner.summaryKnowledge = core.approve(draft, draft.entries.map(entry => ({ ...entry,
      knowledge_scope: entry.text.includes('排除摘要') ? 'exclude' : entry.text.includes('私密摘要') ? 'actors' : 'shared',
      known_by: entry.text.includes('私密摘要') ? ['琳'] : []
    })), ctx.Chat.messages, ctx.Chat.summary, ctx.Chat.summarizedUntil, owner);
  };
  const build = async () => {
    const before = calls;
    const output = await ctx.App.buildMessages();
    assert.equal(calls, before, 'review/selection/recall must add no model request');
    assert.equal(output[0].content, 'FIXED');
    return JSON.stringify(output);
  };
  const snapshot = () => clone(ctx.Storage.buildStoryPayload('longplay acceptance'));
  const restore = save => {
    assert.equal(ctx.Storage.restoreStory(clone(save)), true, ctx.Storage._lastRestoreError?.message);
    assert.equal(ctx.App.config.api.key, '', 'portable saves cannot restore an API key');
    ctx.App.config.api.key = 'mock'; // Simulate reconnecting the fixture transport.
  };
  approve();
  const beginning = snapshot();
  let pendingTurns = 0, rereviews = 0, reloads = 0, rewinds = 0;
  for (let turn = 1; turn <= 120; turn++) {
    ctx.Chat.messages.push({ id: 'turn-u-' + turn, role: 'user', content: `玩家原文第${turn}輪。` },
      { id: 'turn-a-' + turn, role: 'assistant', content: `角色原文第${turn}輪。` });
    const covered = ctx.GameState.current.summaryKnowledge.cursor;
    await ctx.Chat.afterTurn(ctx.App.config);
    assert.equal(ctx.BAOStoryMaintenanceLock.has(ctx.GameState.current), false);
    assert.equal(ctx.Chat.messages.length, 2 + turn * 2, 'automatic summary must retain every original message');
    const output = await build();
    assert.doesNotMatch(output, /排除摘要7002/, '[longplay] excluded marker leaked');
    assert.match(output, /私密摘要7003/);
    assert.ok(ctx.Chat.contextGuard.rawStart <= covered, 'pending summary cannot advance reviewed coverage');
    for (const message of ctx.Chat.messages.slice(covered))
      assert.ok(output.includes(message.content), '[longplay] raw source missing: ' + message.id);
    const selected = core.view({ state: ctx.GameState.current, summary: ctx.Chat.summary, cursor: ctx.Chat.summarizedUntil,
      messages: ctx.Chat.messages, config: ctx.App.config, primary: '艾琳' });
    if (selected.pending) {
      pendingTurns++;
      assert.ok(!output.includes(`共享摘要7001版本${calls}。`), 'new unreviewed summary cannot enter the story prompt');
    }
    if (turn % 15 === 0) {
      ctx.GameState.current.npcs.push({ npc_id: 'guard', name: '守衛', presence: 'present' });
      const mixed = await build();
      assert.doesNotMatch(mixed, /私密摘要7003/, 'a mixed cast cannot borrow one actor’s private scope');
      assert.match(mixed, /共享摘要7001/);
      ctx.GameState.current.npcs.pop();
    }
    if (turn % 30 === 0) {
      const before = calls;
      approve(); rereviews++;
      assert.equal(calls, before);
      assert.ok((await build()).includes(`共享摘要7001版本${calls}。`));
    }
    if (turn % 40 === 0) {
      const head = snapshot(), review = JSON.stringify(head.state.summaryKnowledge);
      assert.ok(!JSON.stringify(head).includes('"key":"mock"'));
      restore(head); reloads++;
      assert.equal(JSON.stringify(ctx.GameState.current.summaryKnowledge), review);
      assert.doesNotMatch(await build(), /排除摘要7002/);
      ctx.Chat.messages[0].content = '來源已改寫。';
      await assert.rejects(build(), /來源已改寫/);
      restore(head);
      const historical = beginning;
      if (historical.chat.messages.length < head.chat.messages.length) {
        restore({ ...historical, state: head.state });
        await assert.rejects(build(), /進度不符|原文|來源/, 'future review cannot attach to an earlier branch');
        restore(historical); rewinds++;
        assert.doesNotMatch(await build(), /排除摘要7002/);
        assert.equal(ctx.Chat.messages.length, historical.chat.messages.length);
        restore(head);
        assert.equal(ctx.Chat.messages.length, 2 + turn * 2, 'returning to main retains the full continuation');
      }
    }
  }
  assert.equal(calls, 29, '120 turns keep the original four-turn summary schedule (mock transport only)');
  assert.ok(pendingTurns > 80, 'the acceptance must exercise sustained pending-review history');
  assert.deepEqual([rereviews, reloads, rewinds], [4, 3, 3]);
  console.log(`PASS 120-turn summary review: ${calls} mocked automatic summaries, ${pendingTurns} pending turns, 4 re-reviews, 3 payload reload/source-rewrite/rewind cycles; no added model calls`);
}

run().then(() => {
  if (fault) return;
  for (const [mode, expected] of [['raw', '[longplay] raw source missing'], ['scope', '[longplay] excluded marker leaked']]) {
    const result = spawnSync(process.execPath, [__filename, '--fault=' + mode], { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1, 'injected ' + mode + ' regression must fail acceptance');
    assert.ok((result.stderr + result.stdout).includes(expected), 'fault must fail for the intended invariant');
  }
  console.log('PASS longplay gate rejects injected raw-history loss and excluded-summary leaks');
}).catch(error => { console.error(error); process.exitCode = 1; });

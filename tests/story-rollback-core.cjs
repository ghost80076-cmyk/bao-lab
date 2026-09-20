'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-rollback.js'), 'utf8');

function fixture({ checkpoint = true, confirm = true, pending = false, createFails = false, restoreFails = false } = {}) {
  const events = { alerts: [], saves: 0, restored: [], created: 0, prompts: 0 };
  const oldMessages = [
    { id: 'u1', role: 'user', content: 'start' },
    { id: 'a1', role: 'assistant', content: 'at the crossroads' },
    { id: 'u2', role: 'user', content: 'go north' },
    { id: 'a2', role: 'assistant', content: 'north it is' },
  ];
  const originalRefs = { storyId: 'story1', chapterId: 'main', chapterLabel: '主線' };
  let refs = structuredClone(originalRefs);
  const oldSave = { characterId: 'char1', config: { api: { model: 'test' } }, chat: { messages: structuredClone(oldMessages), summary: 'modern memory' }, state: { money: 20 }, _library: structuredClone(originalRefs) };
  const pointPayload = { characterId: 'char1', config: { api: { model: 'test' } }, chat: { messages: [], summary: 'historical memory', summarizedUntil: 0 }, state: { money: 100, npcs: [] } };
  const records = oldMessages.map((m, seq) => ({ kind: 'message', storyId: 'story1', chapterId: 'main', messageId: m.id, role: m.role, seq }));
  if (checkpoint) records.push({ kind: 'checkpoint', storyId: 'story1', chapterId: 'main', messageId: 'a1', seq: 1, payload: pointPayload });
  const chat = { messages: structuredClone(oldMessages), summarizing: false };
  const app = {
    config: { api: { key: 'secret' } }, __requestPending: pending,
    saveStory: () => { events.saves++; return true; },
    renderChatShell: () => {}, showView: () => {}
  };
  const storage = {
    validateStory: p => !!(p.characterId && p.config && p.chat && Array.isArray(p.chat.messages)),
    flush: async () => 'indexedDB', loadStory: () => structuredClone(oldSave),
    restoreStory: p => {
      events.restored.push(structuredClone(p));
      if (restoreFails && p !== oldSave && p?.state?.money === 100) return false;
      chat.messages = structuredClone(p.chat.messages);
      app.config = structuredClone(p.config);
      refs = structuredClone(p._library);
      return true;
    }
  };
  const library = {
    open: async () => true,
    flush: async () => true,
    refs: () => structuredClone(refs),
    allRecords: async () => records,
    adoptRefs: ({ _library }) => { refs = structuredClone(_library); return true; },
    createBranch: async (id, label) => {
      events.created++;
      assert.equal(id, 'a1');
      assert.match(label, /回溯/);
      refs = { ...originalRefs, chapterId: 'branch1', parentChapterId: 'main' };
      if (createFails) throw new Error('quota reached');
      return { ...structuredClone(pointPayload), chat: { ...structuredClone(pointPayload.chat), messages: structuredClone(oldMessages.slice(0,2)) }, _library: structuredClone(refs) };
    }
  };
  const observer = class { observe() {} };
  const win = {
    BAOStoryLibrary: library,
    BAOStoryBranches: { open() {} },
    BAOStoryRevisionState: { whenIdle: async () => {} },
    confirm: () => { events.prompts++; return confirm; },
    alert: m => events.alerts.push(m),
    BAORefreshSaveUI() {}
  };
  const context = vm.createContext({ window: win, App: app, Chat: chat, Storage: storage, GameState: { current: { money: 20 } },
    document: { body: {}, querySelectorAll: () => [] }, MutationObserver: observer,
    queueMicrotask: () => {}, setTimeout: () => {}, console });
  vm.runInContext(source, context, { filename: 'story-rollback.js' });
  assert(win.BAOStoryRollback, 'rollback module should initialize');
  return { rollback: win.BAOStoryRollback, events, win, app, chat, getRefs: () => refs };
}

(async () => {
  {
    const f = fixture();
    assert.equal(await f.rollback.rewind(1), true);
    assert.equal(f.chat.messages.length, 2);
    assert.equal(f.getRefs().chapterId, 'branch1');
    assert.equal(f.app.config.api.key, 'secret');
    assert.equal(f.events.restored[0].state.money, 100);
    assert.equal(f.events.restored[0].chat.summary, 'historical memory');
    assert.equal(f.events.created, 1);
    assert.match(f.events.alerts.at(-1), /原故事線完整保留/);
    console.log('PASS rollback branches at historical checkpoint and restores state, memory and session API key');
  }
  {
    const f = fixture({ checkpoint: false });
    assert.equal(await f.rollback.rewind(1), false);
    assert.equal(f.events.created, 0);
    assert.equal(f.chat.messages.length, 4);
    assert.match(f.events.alerts[0], /沒有完整的歷史狀態/);
    console.log('PASS missing historical checkpoint is rejected without modifying the story');
  }
  {
    const f = fixture({ pending: true });
    assert.equal(await f.rollback.rewind(1), false);
    assert.equal(f.events.created, 0);
    console.log('PASS rollback is refused while a request is pending');
  }
  {
    const f = fixture({ confirm: false });
    assert.equal(await f.rollback.rewind(1), false);
    assert.equal(f.events.created, 0);
    assert.equal(f.chat.messages.length, 4);
    console.log('PASS cancelling confirmation preserves original story');
  }
  {
    const f = fixture({ createFails: true });
    assert.equal(await f.rollback.rewind(1), false);
    assert.equal(f.getRefs().chapterId, 'main');
    assert.equal(f.chat.messages.length, 4);
    assert.equal(f.app.config.api.key, 'secret');
    assert.match(f.events.alerts.at(-1), /quota reached/);
    console.log('PASS branch creation failure restores original references and story');
  }
  {
    const f = fixture({ restoreFails: true });
    assert.equal(await f.rollback.rewind(1), false);
    assert.equal(f.getRefs().chapterId, 'main');
    assert.equal(f.chat.messages.length, 4);
    assert.equal(f.app.config.api.key, 'secret');
    console.log('PASS failed restore recovers original story and API key');
  }
  {
    const f = fixture();
    assert.equal(await f.rollback.rewind(3), false);
    assert.equal(f.events.created, 0);
    console.log('PASS last assistant message cannot be rewound unnecessarily');
  }
  console.log('PASS 7 rollback core regression cases');
})().catch(error => { console.error(error); process.exitCode = 1; });

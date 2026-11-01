'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const refs = { storyId: 'story', chapterId: 'main', chapterLabel: '主線' };
const messages = [
  { id: 'u1', role: 'user', content: 'historical player text' },
  { id: 'a1', role: 'assistant', content: 'historical reply' }
];
function fixture() {
  const db = new Database(), raw = new Map();
  const c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, v) => raw.set(key, String(v)), removeItem: key => raw.delete(key)
  } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8').replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', c);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/story-library.js'), 'utf8'), c);
  const lib = c.BAOStoryLibrary;
  lib._db = db; lib.open = async () => db;
  c.Storage.saveStory = () => true;
  const payload = { characterId: 'hero', savedAt: '2026-11-01', config: { api: {} },
    preferences: { memorySlots: [{ text: 'historical pinned fact' }] },
    chat: { messages: structuredClone(messages), summary: 'historical summary', summarizedUntil: 2 },
    state: { money: 100, time: 'night', npcs: [{ name: 'historical NPC' }], pendingStateTurns: [],
      contextPack: { source: { type: 'current-story', messageCount: 2 }, summary: 'historical pack' } },
    _library: structuredClone(refs) };
  payload.contextPack = structuredClone(payload.state.contextPack);
  return { c, db, lib, payload };
}
async function main() {
  const f = fixture();
  await f.lib.persist(f.payload); f.lib.adoptRefs(f.payload);
  const recordId = 'checkpoint:story:main:a1';
  const old = structuredClone(f.db.records.get(recordId));
  const pending = structuredClone(f.payload);
  pending.chat.messages.push({ id: 'u2', role: 'user', content: 'future player text' });
  pending.chat.summary = 'future summary'; pending.chat.summarizedUntil = 3;
  pending.state.money = 9;
  await f.lib.persist(pending);
  assert.deepEqual(f.db.records.get(recordId), old, 'saving a pending player turn cannot overwrite the preceding historical checkpoint');
  const future = structuredClone(pending);
  future.chat.messages.push({ id: 'a2', role: 'assistant', content: 'future reply' });
  await f.lib.persist(future);
  const branch = await f.lib.createBranch('a1', 'recovered');
  assert.equal(branch.state.money, 100);
  assert.equal(branch.chat.summary, 'historical summary');
  assert.equal(branch.chat.summarizedUntil, 2);
  assert.equal(branch.chat.messages.length, 2);
  assert.equal(branch.preferences.memorySlots[0].text, 'historical pinned fact');
  assert.equal(branch.contextPack.summary, 'historical pack');
  assert.equal(branch.state.pendingStateTurns.length, 0);
  assert.equal(f.lib.recoveryReport(branch).ok, true);
  assert.equal((await f.lib.reconstruct('story', 'main')).chat.messages.length, 4);

  const report = f.lib.recoveryReport(f.payload, { checkpoint: old });
  assert.equal(report.ok, true);
  assert.equal(report.warnings.length, 0);
  assert.equal(JSON.stringify(report).includes('historical'), false, 'diagnostics contain counts and errors, never private story text');
  const legacy = structuredClone(old); delete legacy.boundary;
  assert.match(f.lib.recoveryReport(f.payload, { checkpoint: legacy }).warnings.join(''), /舊檢查點/);
  for (const [label, change] of [
    ['cursor', p => p.chat.summarizedUntil = 3],
    ['negative cursor', p => p.chat.summarizedUntil = -1],
    ['fractional cursor', p => p.chat.summarizedUntil = 1.5],
    ['empty summary', p => p.chat.summary = ''],
    ['duplicate IDs', p => p.chat.messages[0].id = 'a1'],
    ['future pack', p => p.state.contextPack.source.messageCount = 3],
    ['future resume', p => p.state.contextPackDraftResume = { source: { kind: 'current-story', messageCount: 3 } }],
    ['future rebuild', p => p.state.fullMemoryRebuild = { plan: { endId: 'a2' } }],
    ['future backup', p => p.state.fullMemoryRebuildBackup = { summarizedUntil: 3 }],
    ['wrong branch', p => p._library = { ...refs, parentChapterId: 'main' }],
    ['changed original', p => p.chat.messages[0].content = 'edited original']
  ]) {
    const p = structuredClone(f.payload); change(p);
    assert.equal(f.lib.recoveryReport(p, { checkpoint: old }).ok, false, label);
  }
  const withPending = structuredClone(f.payload);
  withPending.state.pendingStateTurns = [{ player: 'future player text', assistant: 'future reply' }];
  const warning = f.lib.recoveryReport(withPending);
  assert.equal(warning.ok, true);
  assert.equal(warning.sources.pendingStateTurns, 1);
  assert.match(warning.warnings.join(''), /無法對應/);

  for (const mode of ['cursor', 'changed original', 'gap', 'checkpoint sequence']) {
    const x = fixture();
    await x.lib.persist(x.payload); x.lib.adoptRefs(x.payload);
    const cp = x.db.records.get(recordId);
    if (mode === 'cursor') cp.payload.chat.summarizedUntil = 99;
    if (mode === 'checkpoint sequence') cp.seq = 0;
    if (mode === 'changed original') {
      const changed = [...x.db.records.values()].find(r => r.kind === 'message' && r.seq === 0);
      changed.messagePayload.content = 'modified after checkpoint';
    }
    if (mode === 'gap') {
      const first = [...x.db.records.values()].find(r => r.kind === 'message' && r.seq === 0);
      x.db.records.delete(first.id);
    }
    const before = x.lib.refs();
    await assert.rejects(x.lib.createBranch('a1', 'invalid'), /驗證|不連續/);
    assert.equal(JSON.stringify(x.lib.refs()), JSON.stringify(before), mode + ' does not switch refs');
    assert.equal((await x.lib.listChapters('story')).length, 1, mode + ' does not commit a branch');
    if (mode === 'cursor') assert.equal(cp.payload.chat.summarizedUntil, 99, 'invalid cursor is never silently clamped');
  }
  console.log('Recovery integrity: pending-save isolation, historical branch restoration, provenance, range validation, diagnostics privacy and failure preservation passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

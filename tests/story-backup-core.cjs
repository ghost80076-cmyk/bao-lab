const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

global.Storage = {
  clone(value) { return structuredClone(value); },
  scrubSecrets(value) {
    const walk = (input, parent = '') => {
      if (Array.isArray(input)) return input.map(item => walk(item));
      if (!input || typeof input !== 'object') return input;
      const out = {};
      for (const [key, item] of Object.entries(input)) {
        const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
        if (normalized === 'apikey' || (normalized === 'key' && parent.toLowerCase().endsWith('api'))) continue;
        out[key] = walk(item, key);
      }
      return out;
    };
    return walk(structuredClone(value));
  },
  sanitizeImportedStory(save) {
    if (!save?.characterId || !save?.config || !save?.chat || !Array.isArray(save.chat.messages || [])) throw new Error('invalid story');
    const clean = this.scrubSecrets(save);
    clean.config.api = Object.assign({}, clean.config.api || {}, { key: '' });
    clean.chat.messages = Array.isArray(clean.chat.messages) ? clean.chat.messages : [];
    clean.state = clean.state || {};
    clean.state.config = clean.config;
    return clean;
  },
  saveStory() { return true; },
  hasStory() { return true; },
  async importFile(file) { return this.sanitizeImportedStory(JSON.parse(await file.text())); }
};

const payload = (chapterId, label, parentChapterId, location, summary, secret = 'SECRET') => ({
  schema: 'bao-lab-story', version: 4, savedAt: '2026-09-16T00:00:00.000Z',
  characterId: 'hero', characterName: '林沉風', character: { id: 'hero', name: '林沉風' },
  config: { api: { model: 'demo', key: secret }, persona: { name: '玩家' } }, preferences: {},
  chat: { messages: [
    { id: chapterId + '-u', role: 'user', content: '玩家行動' },
    { id: chapterId + '-a', role: 'assistant', content: label + '回覆' }
  ], summary, summarizedUntil: 0, usage: {}, lastStoryPromptTokens: 0 },
  contextPack: { summary: label + ' Context Pack' },
  state: { location, time: label + '時間', characterStatuses: { hero: { trust: label } }, modules: { inventory: [{ name: label + '物品' }] } },
  _library: {
    storyId: 'story-old', chapterId, storyCreatedAt: '2026-09-15T00:00:00.000Z', chapterCreatedAt: '2026-09-15T01:00:00.000Z',
    chapterLabel: label, parentChapterId, branchPointMessageId: parentChapterId ? 'root-a' : '', branchPointSeq: parentChapterId ? 1 : -1, branchPointPreview: parentChapterId ? '分岔點' : ''
  }
});

const rootPayload = payload('root', '主線', '', '城門', '主線摘要');
const branchPayload = payload('branch', '碼頭線', 'root', '碼頭', '分支摘要');
let currentRefs = { ...branchPayload._library };
let nextId = 0;
let records = [
  { id: 'story:story-old', kind: 'story', storyId: 'story-old', characterId: 'hero', characterName: '林沉風', title: '舊城之夜', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z', activeChapterId: 'branch' },
  { id: 'chapter:story-old:root', kind: 'chapter', storyId: 'story-old', chapterId: 'root', label: '主線', createdAt: '2026-09-15T01:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z', parentChapterId: '', branchPointSeq: -1 },
  { id: 'chapter:story-old:branch', kind: 'chapter', storyId: 'story-old', chapterId: 'branch', label: '碼頭線', createdAt: '2026-09-15T02:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z', parentChapterId: 'root', branchPointMessageId: 'root-a', branchPointSeq: 1, branchPointPreview: '分岔點' },
  { id: 'checkpoint:story-old:root:root-a', kind: 'checkpoint', storyId: 'story-old', chapterId: 'root', messageId: 'root-a', seq: 1, updatedAt: '2026-09-15T01:00:00.000Z', payload: { ...rootPayload, chat: { ...rootPayload.chat, messages: undefined } } }
];
const payloads = new Map([['story-old:root', rootPayload], ['story-old:branch', branchPayload]]);

const upsert = record => {
  const index = records.findIndex(item => item.id === record.id);
  if (index >= 0) records[index] = structuredClone(record); else records.push(structuredClone(record));
};

global.BAOStoryLibrary = {
  refs() { return structuredClone(currentRefs); },
  async flush() { return true; },
  async allRecords() { return structuredClone(records); },
  async reconstruct(storyId, chapterId) {
    const found = payloads.get(storyId + ':' + chapterId);
    return found ? Storage.sanitizeImportedStory(found) : null;
  },
  async open() { return true; },
  id(prefix) { nextId += 1; return prefix + '-new-' + nextId; },
  adoptRefs(input) { currentRefs = structuredClone(input._library || {}); return true; },
  clearRefs() { currentRefs = {}; },
  async persist(input) {
    const save = Storage.sanitizeImportedStory(input);
    const lib = save._library;
    payloads.set(lib.storyId + ':' + lib.chapterId, save);
    const existingStory = records.find(item => item.kind === 'story' && item.storyId === lib.storyId);
    upsert({
      id: 'story:' + lib.storyId, kind: 'story', storyId: lib.storyId, characterId: save.characterId, characterName: save.characterName,
      title: existingStory?.title || save.characterName, createdAt: lib.storyCreatedAt, updatedAt: save.savedAt, activeChapterId: lib.chapterId
    });
    upsert({
      id: 'chapter:' + lib.storyId + ':' + lib.chapterId, kind: 'chapter', storyId: lib.storyId, chapterId: lib.chapterId,
      label: lib.chapterLabel, createdAt: lib.chapterCreatedAt, updatedAt: save.savedAt, parentChapterId: lib.parentChapterId || '',
      branchPointMessageId: lib.branchPointMessageId || '', branchPointSeq: lib.branchPointSeq, branchPointPreview: lib.branchPointPreview || ''
    });
    return true;
  },
  async transaction(_mode, action) { action({ put: upsert }); return true; },
  async deleteStory(storyId) { records = records.filter(item => item.storyId !== storyId); return true; }
};

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-backup.js'), 'utf8');
vm.runInThisContext(code, { filename: 'js/story-backup.js' });

(async () => {
  const bundle = await BAOStoryBackup.buildBundle('story-old');
  assert.equal(bundle.schema, 'bao-lab-story-bundle');
  assert.equal(bundle.chapters.length, 2);
  assert.equal(bundle.activeChapterId, 'branch');
  assert.equal(bundle.chapters.find(item => item.chapterId === 'root').checkpoints.length, 1);
  assert.equal(JSON.stringify(bundle).includes('SECRET'), false);
  assert.equal(bundle.chapters.find(item => item.chapterId === 'branch').payload.contextPack.summary, '碼頭線 Context Pack');
  assert.equal(bundle.chapters.find(item => item.chapterId === 'root').payload.state.location, '城門');

  const beforeRefs = BAOStoryLibrary.refs();
  const imported = await BAOStoryBackup.importBundle(bundle);
  assert.notEqual(imported.storyId, 'story-old');
  assert.equal(imported.chapterCount, 2);
  assert.deepEqual(BAOStoryLibrary.refs(), beforeRefs);
  assert.equal(imported.payload.state.location, '碼頭');
  assert.equal(imported.payload.chat.summary, '分支摘要');
  assert.equal(imported.payload.contextPack.summary, '碼頭線 Context Pack');
  assert.equal(imported.payload.config.api.key, '');

  const importedChapters = records.filter(item => item.kind === 'chapter' && item.storyId === imported.storyId);
  assert.equal(importedChapters.length, 2);
  const importedRoot = importedChapters.find(item => item.label === '主線');
  const importedBranch = importedChapters.find(item => item.label === '碼頭線');
  assert.equal(importedBranch.parentChapterId, importedRoot.chapterId);
  const importedStory = records.find(item => item.kind === 'story' && item.storyId === imported.storyId);
  assert.equal(importedStory.title, '舊城之夜');
  assert.equal(importedStory.activeChapterId, importedBranch.chapterId);
  assert.ok(records.some(item => item.kind === 'checkpoint' && item.storyId === imported.storyId && item.messageId === 'root-a'));
  assert.equal(JSON.stringify(records.filter(item => item.storyId === imported.storyId)).includes('SECRET'), false);

  console.log('story backup core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

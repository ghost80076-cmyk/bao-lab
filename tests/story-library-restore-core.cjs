const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js/storage.js'), 'utf8');
const toolsSource = fs.readFileSync(path.join(__dirname, '..', 'js/story-tools.js'), 'utf8');
const start = toolsSource.indexOf('  const restoreLibraryChapter = async');
const end = toolsSource.indexOf('  const libraryScreen = async', start);
assert.ok(start >= 0 && end > start);
const sample = {
  savedAt: '2026-10-08T12:00:00.000Z',
  characterId: 'catalog-hero', characterName: 'Hero', config: { api: {}, persona: {} },
  chat: { messages: [{ id: 'm1', role: 'user', content: 'Existing progress' }], summary: '' },
  state: { location: 'Old location', memory: ['Preserved memory'] }
};

async function run(input, mode) {
  const save = structuredClone(input);
  const alerts = [];
  const oldState = { location: 'Current story' };
  const oldMessages = [{ id: 'current', role: 'user', content: 'Current story' }];
  let loads = 0, pages = 0, prompts = 0, saves = 0;
  const context = { structuredClone, console: { warn() {} }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
  context.window = context;
  context.Chat = { messages: oldMessages };
  context.GameState = { current: oldState };
  context.App = {
    characters: mode === 'paged' ? [] : [{ id: save.characterId, catalog_only: true }],
    hasMoreCharacterCatalog() { return mode === 'paged' && pages < 2; },
    async loadMoreCharacters() { pages++; if (pages === 2) this.characters.push({ id: save.characterId, catalog_only: true }); },
    async loadCharacter(id) {
      loads++;
      if (mode === 'offline' || mode === 'snapshot') throw new Error('offline');
      if (mode === 'missing') return null;
      const hero = { id, name: save.characterName, catalog_only: false };
      this.characters = [hero];
      return hero;
    },
    renderChatShell() {}, showView() {}, saveStory() { saves++; }
  };
  context.BAOStoryLibrary = { async reconstruct() { return structuredClone(save); } };
  context.prompt = () => { prompts++; return 'NEW-KEY'; };
  context.tell = message => alerts.push(message);
  context.close = () => {};
  vm.createContext(context);
  vm.runInContext(storageSource.replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', context);
  const expectedSave = context.Storage.sanitizeImportedStory(save);
  vm.runInContext(toolsSource.slice(start, end) + '\nwindow.restoreChapter = restoreLibraryChapter;', context);
  const button = { textContent: 'Continue', disabled: false, isConnected: true };
  await context.restoreChapter('story', 'chapter', button);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Continue');
  if (mode === 'offline' || mode === 'missing') {
    assert.equal(alerts.length, 1);
    assert.equal(prompts, 0);
    assert.equal(saves, 0);
    assert.equal(context.GameState.current, oldState);
    assert.equal(context.Chat.messages, oldMessages);
  } else {
    assert.deepEqual(alerts, []);
    assert.equal(JSON.stringify(context.Chat.messages), JSON.stringify(expectedSave.chat.messages));
    const expected = structuredClone(expectedSave.state);
    expected.config = { ...expectedSave.config, api: { ...expectedSave.config.api, key: 'NEW-KEY' } };
    if (expectedSave.contextPack && !expected.contextPack) expected.contextPack = expectedSave.contextPack;
    assert.equal(JSON.stringify(context.GameState.current), JSON.stringify(expected));
    assert.equal(context.App.activeCharacter.id, save.characterId);
    assert.equal(saves, 1);
    assert.equal(loads, 1);
    if (mode === 'paged') assert.equal(pages, 2);
  }
}

(async () => {
  await run(sample, 'fresh');
  await run(sample, 'paged');
  await run(sample, 'offline');
  await run(sample, 'missing');
  await run({ ...sample, character: { id: sample.characterId, name: 'Snapshot hero' } }, 'snapshot');
  if (process.argv[2]) {
    const bundle = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    await run(bundle.chapters[0].payload, 'fresh');
  }
  console.log('story library restore core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const entries = new Map([['bao-lab:scene-html-preferences', JSON.stringify({ mode: 'native', status: 'native' })]]);
const localStorage = {
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, String(value)),
  removeItem: key => entries.delete(key)
};
const controls = [{ value: '' }, { value: '' }];
const panel = { querySelectorAll: () => controls };
let changeHandler;
let refreshes = 0;
const scene = { prefs: { mode: 'native', status: 'native' }, refresh() { refreshes += 1; } };
const character = { id: 'story-test', name: '測試角色', greeting: '開場', initial_state: {} };
const chat = { messages: [], summary: '', summarizedUntil: 0, usage: {}, lastStoryPromptTokens: 0 };
const state = {
  current: null,
  create(character, config) {
    this.current = { time: '早晨', location: '海邊', npcs: [{ name: '阿青', presence: 'away' }], events: [], config };
    return this.current;
  }
};
const app = {
  characters: [character], activeCharacter: character, config: {},
  saveStory() { return this.window.Storage.saveStory(); },
  renderChatShell() { return `${scene.prefs.mode}/${scene.prefs.status}`; }
};
const document = {
  querySelectorAll(selector) { return selector === '#bao-scene-controls select' ? controls : []; },
  addEventListener(name, callback) { if (name === 'change') changeHandler = callback; }
};
const context = { console, localStorage, document, structuredClone, Chat: chat, GameState: state, App: app };
context.window = context;
app.window = context;
context.BAOSceneHTML = scene;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/storage.js', 'utf8') + '\nwindow.Storage = Storage;', context);
vm.runInContext(fs.readFileSync('js/scene-story-preferences.js', 'utf8'), context);
const storage = context.Storage;
assert.ok(context.BAOSceneStoryPreferences, 'story preference module must initialize');
assert.match(fs.readFileSync('js/chat-markup.js', 'utf8'), /script\.src\s*=\s*['"]js\/scene-html-modes\.js['"]/);
assert.match(fs.readFileSync('js/chat-markup.js', 'utf8'), /settings\.src\s*=\s*['"]js\/scene-story-preferences\.js['"]/);
assert.equal(typeof changeHandler, 'function', 'scene controls need to save changes in the active story');

const updateSelection = (mode, status, index) => {
  scene.prefs.mode = mode;
  scene.prefs.status = status;
  localStorage.setItem('bao-lab:scene-html-preferences', JSON.stringify({ mode, status }));
  changeHandler({ target: { closest: () => panel, __index: index } });
};
const select = (index, mode, status) => {
  scene.prefs.mode = mode;
  scene.prefs.status = status;
  localStorage.setItem('bao-lab:scene-html-preferences', JSON.stringify({ mode, status }));
  changeHandler({ target: { closest: () => panel } });
};
// Use the same two select nodes the real change handler checks.
const choose = (mode, status) => {
  scene.prefs.mode = mode;
  scene.prefs.status = status;
  localStorage.setItem('bao-lab:scene-html-preferences', JSON.stringify({ mode, status }));
  changeHandler({ target: Object.assign(controls[0], { closest: () => panel }) });
};

app.config = { narrativeMode: 'world', displayMode: 'text', api: { key: 'PRIVATE_STORY_KEY', model: 'mock' } };
state.create(character, app.config);
assert.equal(app.renderChatShell(), 'native/native');
choose('free', 'author');
let saveA = storage.loadStory();
assert.equal(saveA.config.scenePresentation.mode, 'free');
assert.equal(saveA.config.scenePresentation.status, 'author');
assert.equal(saveA.state.npcs[0].presence, 'away');
assert.ok(!JSON.stringify(saveA).includes('PRIVATE_STORY_KEY'), 'backup must not contain API credentials');

// Starting B chooses browser defaults, not whatever story A was last restored.
localStorage.setItem('bao-lab:scene-html-preferences', JSON.stringify({ mode: 'efficient', status: 'hidden' }));
app.config = { narrativeMode: 'world', displayMode: 'ui', api: { key: 'PRIVATE_B_KEY', model: 'mock' } };
state.create(character, app.config);
assert.equal(app.renderChatShell(), 'efficient/hidden');
storage.saveStory();
const saveB = storage.loadStory();
assert.equal(saveB.config.scenePresentation.mode, 'efficient');
assert.equal(saveB.config.scenePresentation.status, 'hidden');

assert.equal(storage.restoreStory(saveA), true);
assert.equal(app.renderChatShell(), 'free/author');
assert.deepEqual(controls.map(control => control.value), ['free', 'author']);
assert.equal(state.current.npcs[0].presence, 'away', 'changing presentation must not change NPC presence');
assert.equal(localStorage.getItem('bao-lab:scene-html-preferences'), JSON.stringify({ mode: 'efficient', status: 'hidden' }),
  'restoring A must not overwrite defaults used to create new stories');
app.config.displayMode = 'ui';
assert.equal(app.renderChatShell(), 'free/author', 'text/UI change must not alter story presentation');
assert.equal(storage.buildStoryPayload().config.scenePresentation.mode, 'free');
assert.ok(!JSON.stringify(storage.buildStoryPayload()).includes('PRIVATE_STORY_KEY'));

assert.equal(storage.restoreStory(saveB), true);
assert.equal(app.renderChatShell(), 'efficient/hidden');
assert.deepEqual(controls.map(control => control.value), ['efficient', 'hidden']);
assert.equal(state.current.npcs[0].presence, 'away');

const legacy = structuredClone(saveA);
delete legacy.config.scenePresentation;
delete legacy.state.config.scenePresentation;
assert.equal(storage.restoreStory(legacy), true, 'old saves must remain loadable');
assert.equal(app.renderChatShell(), 'efficient/hidden', 'old saves inherit the existing browser preference once');
assert.equal(storage.buildStoryPayload().config.scenePresentation.mode, 'efficient');
assert.equal(context.BAOSceneStoryPreferences.normalize({ mode: 'bad', status: 'bad' }).mode, 'efficient');
assert.ok(refreshes >= 4, 'restores should repaint the controls');
console.log('Scene story preferences: PASS (per-story defaults, controls, autosave, switching, legacy, NPC state, API-key redaction)');

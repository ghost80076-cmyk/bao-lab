const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-persona-manager.js'), 'utf8');
new vm.Script(source, { filename: 'story-persona-manager.js' });
const browserStorage = new Map();
const originalCard = { id: 'world', name: '原角色', system_prompt: '原角色設定', profile: {}, world: '原世界' };
const App = {
  characters: [originalCard], activeCharacter: originalCard, config: {},
  escapeHTML: text => String(text),
  collectConfig() { return { persona: { name: '玩家甲', gender: '女性', identity: '旅人', relationship: '', personality: '', extra: '' } }; },
  startStory() {
    this.config = this.collectConfig();
    state.current = { config: this.config };
    this.renderChatShell();
    this.saveStory();
  },
  openBuilder() {}, renderChatShell() {},
  saveStory() { return Storage.saveStory(); },
  buildSystemPrompt() { return `【平台】\nAI:${this.activeCharacter.name};玩家:${this.config.persona.name}\n\n【角色核心】\n${this.activeCharacter.system_prompt}`; },
  async buildMessages() { return [{ role: 'system', content: this.buildSystemPrompt() }, { role: 'user', content: '你好' }]; }
};
const state = { current: null };
const Storage = {
  clone: value => JSON.parse(JSON.stringify(value)),
  saveStory() { this.lastSave = { characterId: App.activeCharacter.id, character: this.clone(App.activeCharacter), config: this.clone(App.config), state: this.clone(state.current) }; return true; },
  restoreStory(save) { App.activeCharacter = App.characters.find(item => item.id === save.characterId); App.config = this.clone(save.config); state.current = this.clone(save.state); return Boolean(App.activeCharacter); }
};
const document = {
  head: { appendChild() {} },
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ id: '', style: {}, textContent: '' })
};
const sandbox = {
  App, Storage, GameState: state, CharacterEngine: { normalize: card => Storage.clone(card) },
  document, console, Date, Math, JSON, Promise,
  localStorage: { getItem: key => browserStorage.get(key) || null, setItem: (key, value) => browserStorage.set(key, value) },
  prompt: () => '人物乙', alert: () => {}, confirm: () => true
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'story-persona-manager.js' });
assert.ok(sandbox.BAOStoryActors, 'module initialized');

App.startStory();
assert.notStrictEqual(App.activeCharacter, originalCard, 'new story owns an independent character copy');
assert.equal(state.current.storyActors.baseCharacter.name, '原角色');
const baseline = App.buildSystemPrompt();
App.config.persona.name = '玩家乙';
App.activeCharacter.name = '故事專用角色';
assert.equal(originalCard.name, '原角色', 'source character is never modified');
const prompt = App.buildSystemPrompt();
assert.ok(prompt.startsWith(baseline), 'stable original prompt retains its prefix');
assert.match(prompt, /目前玩家人物/);
assert.match(prompt, /玩家乙/);
assert.match(prompt, /故事專用角色/);

(async () => {
  const messages = await App.buildMessages();
  assert.ok(!messages[0].content.includes('本輪人物覆寫'), 'mutable actors must not enter the stable cache prefix');
  assert.match(messages.at(-1).content, /本輪人物覆寫/);
  assert.match(messages.at(-1).content, /玩家乙/);
  state.current.storyActors.hostedCharacter = { name: '自創男主', role: 'primary', personality: '冷靜' };
  const hosted = await App.buildMessages();
  assert.match(hosted.at(-1).content, /自創男主/);
  assert.match(hosted.at(-1).content, /AI 主要扮演此自訂角色/);

  const preset = sandbox.BAOStoryActors.savePreset({ name: '人物乙', gender: '女性', extra: '設定' });
  assert.equal(preset.persona.name, '人物乙');
  assert.equal(sandbox.BAOStoryActors.readPresets().length, 1);
  assert.ok(!browserStorage.get('bao-lab:persona-presets-v1').includes('apiKey'));

  App.saveStory();
  const save = Storage.clone(Storage.lastSave);
  App.characters[0].name = '人物庫新版本';
  App.activeCharacter = App.characters[0];
  assert.equal(Storage.restoreStory(save), true);
  assert.equal(App.activeCharacter.name, '故事專用角色', 'story snapshot beats same-id library card');
  assert.equal(App.characters[0].name, '人物庫新版本');
  assert.equal(App.config.persona.name, '玩家乙');
  assert.equal(state.current.storyActors.hostedCharacter.name, '自創男主');
  console.log('story persona core: 12 assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
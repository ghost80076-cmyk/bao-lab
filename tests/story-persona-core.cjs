const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-persona-manager.js'), 'utf8');
new vm.Script(source, { filename: 'story-persona-manager.js' });
assert.ok(!source.includes('<option value="card">'), 'author-card editor must not be selectable');
assert.ok(!source.includes('CARD_FIELDS.map'), 'author prompts must never be rendered into an editor');
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
  localStorage: { getItem: key => browserStorage.get(key) || null, setItem: (key, value) => browserStorage.set(key, value), removeItem: key => browserStorage.delete(key) },
  prompt: () => '人物乙', alert: () => {}, confirm: () => true
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'story-persona-manager.js' });
assert.ok(sandbox.BAOStoryActors, 'module initialized');
const draftKey = 'bao-lab:persona-builder-draft-v1:world';
browserStorage.set(draftKey, JSON.stringify({
  version: 1,
  characterId: 'world',
  persona: { name: '未完成玩家', gender: '女性', identity: '旅人', relationship: '', personality: '安靜', extra: '' },
  savedAt: '2026-10-06T00:00:00.000Z'
}));
assert.equal(sandbox.BAOStoryActors.readBuilderDraft().persona.name, '未完成玩家', 'unfinished persona draft can be recovered locally');
App.startStory();
assert.equal(browserStorage.has(draftKey), false, 'successful story creation clears the recovered draft');
assert.notStrictEqual(App.activeCharacter, originalCard, 'story owns an independent character copy');
assert.equal(state.current.storyActors.basePersona.name, '玩家甲');
assert.deepEqual(Array.from(state.current.storyActors.hostedCharacters), []);
App.config.persona.name = '玩家乙';
assert.equal(originalCard.name, '原角色');
assert.equal(originalCard.system_prompt, '原角色設定');

(async () => {
  const playerMessages = await App.buildMessages();
  assert.ok(!playerMessages[0].content.includes('本輪人物覆寫'), 'dynamic override must not enter system prompt');
  assert.match(playerMessages.at(-1).content, /玩家乙/);
  assert.match(playerMessages.at(-1).content, /controlled_by=user/, 'player override keeps explicit user control');
  const actors = state.current.storyActors.hostedCharacters;
  actors.push({ id:'one', name:'自創男主', role:'primary', personality:'冷靜', relationship:'玩家的競爭對手' });
  actors.push({ id:'two', name:'旅館老闆', role:'additional', personality:'熱情' });
  actors.push({ id:'adult-one', name:'成人官方角色', role:'additional', personality:'成人角色', portable:{packId:'adult-one',label:'成人官方角色',rating:'adult',core:'ADULT_CORE',actorMode:true} });
  const messages = await App.buildMessages();
  assert.match(messages.at(-1).content, /自創男主/);
  assert.match(messages.at(-1).content, /旅館老闆/);
  assert.match(messages.at(-1).content, /玩家的競爭對手/);
  assert.match(messages.at(-1).content, /主要互動人物/);
  assert.match(messages.at(-1).content, /controlled_by=assistant/, 'custom AI actors keep explicit assistant control');
  assert.doesNotMatch(messages.at(-1).content, /成人官方角色/, 'adult portable actor pauses while adult content is hidden');
  sandbox.BAOContentPreferences = { isAdultContentEnabled: () => true };
  const adultMessages = await App.buildMessages();
  assert.match(adultMessages.at(-1).content, /成人官方角色/, 'adult portable actor returns when adult content is enabled');
  assert.equal(originalCard.name, '原角色', 'user actors do not mutate the source card');
  const preset = sandbox.BAOStoryActors.savePreset({ name: '人物乙', gender: '女性', extra: '設定' });
  assert.equal(preset.persona.name, '人物乙');
  assert.equal(sandbox.BAOStoryActors.readPresets().length, 1);
  assert.ok(!browserStorage.get('bao-lab:persona-presets-v1').includes('apiKey'));
  const actorPreset = sandbox.BAOStoryActors.saveActorPreset({ name: 'NPC 甲', gender: '女性', identity: '傭兵', personality: '冷靜', role: 'additional' }, 'NPC 甲');
  assert.equal(actorPreset.actor.name, 'NPC 甲');
  assert.equal(sandbox.BAOStoryActors.readActorPresets().length, 1);
  assert.equal(sandbox.BAOStoryActors.readActorPresets()[0].actor.identity, '傭兵');
  assert.ok(!browserStorage.get('bao-lab:actor-presets-v1').includes('apiKey'));
  assert.equal(typeof sandbox.BAOStoryActors.openLibrary, 'function', 'people library is exposed for the My hub');
  assert.ok(!source.includes("DRAFT_KEY_PREFIX}${'${'}App.config.api"), 'draft storage must never include API config');
  App.saveStory();
  const saved = Storage.clone(Storage.lastSave);
  App.characters[0].name = '人物庫新版本';
  App.activeCharacter = App.characters[0];
  assert.equal(Storage.restoreStory(saved), true);
  assert.equal(App.activeCharacter.name, '原角色', 'story snapshot beats same-id library card');
  assert.equal(App.characters[0].name, '人物庫新版本');
  assert.equal(App.config.persona.name, '玩家乙');
  assert.equal(state.current.storyActors.hostedCharacters.length, 3);
  assert.equal(state.current.storyActors.hostedCharacters[1].name, '旅館老闆');
  assert.equal(state.current.storyActors.hostedCharacters[2].name, '成人官方角色');
  console.log('story persona core: author-editor safety, multiple AI actors and save/restore passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
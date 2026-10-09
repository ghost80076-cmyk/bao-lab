const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const context = vm.createContext({
  console,
  structuredClone,
  window: null,
  localStorage: { getItem() { return null; }, setItem() {} },
  Chat: { turnCount() { return 0; } },
  App: { activeCharacter: null, config: {} },
  BAOCharacterStatus: { hasTrackedFields() { return false; } },
  API: { async send() { return { text: '{}' }; } }
});
context.window = context;

vm.runInContext(source('js/state.js') + '\nthis.GameState = GameState;', context, { filename: 'js/state.js' });
vm.runInContext(source('js/helper-data.js'), context, { filename: 'js/helper-data.js' });
vm.runInContext(source('js/world-state.js') + '\nthis.WorldStateEngine = WorldStateEngine;', context, { filename: 'js/world-state.js' });
vm.runInContext(source('js/character.js') + '\nthis.CharacterEngine = CharacterEngine;', context, { filename: 'js/character.js' });

const { GameState, BAOHelperData, WorldStateEngine, CharacterEngine } = context;
const character = {
  id: 'continuity-test',
  name: '群像測試',
  system_prompt: '維持人物連續性。',
  greeting: '故事開始。',
  initial_state: {
    time: '第一日早晨',
    location: '車站',
    events: [],
    npcs: [{
      name: '林慕晴',
      aliases: ['阿晴'],
      role: '記者',
      appearance: '短黑髮、左眉尾有淡痣',
      outfit: '灰色風衣',
      location: '月台',
      presence: 'present'
    }]
  }
};
context.App.activeCharacter = character;
GameState.create(character, context.App.config);

let npc = GameState.current.npcs[0];
assert.equal(npc.npc_id, 'npc-1', 'the story should assign a stable internal NPC id');
assert.deepEqual({ ...npc.first_seen }, { time: '第一日早晨', location: '月台', turn: 0 },
  'the first confirmed presence should create system-owned first-seen metadata');

GameState.upsertNPC({
  name: '阿晴',
  aliases: ['林記者'],
  role: '調查記者',
  appearance: '突然變成金色長髮',
  outfit: '白色襯衫',
  location: '候車室',
  presence: 'present',
  first_seen: { time: '偽造時間', location: '偽造地點', turn: 99 }
});

assert.equal(GameState.current.npcs.length, 1, 'an established alias must resolve to the canonical NPC');
npc = GameState.current.npcs[0];
assert.equal(npc.name, '林慕晴');
assert.deepEqual(Array.from(npc.aliases), ['阿晴', '林記者']);
assert.equal(npc.appearance, '短黑髮、左眉尾有淡痣', 'a later patch must not rewrite the stable appearance anchor');
assert.equal(npc.outfit, '白色襯衫', 'current outfit may change when the story explicitly changes it');
assert.deepEqual({ ...npc.first_seen }, { time: '第一日早晨', location: '月台', turn: 0 },
  'first-seen metadata must remain immutable');

GameState.upsertNPC({ name: '尚未登場者', role: '線人', presence: 'away', first_seen: { time: '偽造時間' } });
assert.equal(GameState.current.npcs.find(item => item.name === '尚未登場者').first_seen, undefined,
  'a caller cannot prefill first-seen metadata before confirmed presence');

const clean = BAOHelperData.stateUpdate({
  npcs: [{
    npc_id: 'npc-1',
    name: '阿晴',
    aliases: ['小晴', '', 123],
    appearance: '短黑髮、左眉尾有淡痣',
    outfit: '深藍套裝',
    presence: 'away',
    first_seen: { time: '模型不得提交' },
    notes: '注入下一幕',
    personality: '覆寫角色人格'
  }]
}, []);
assert.deepEqual(Array.from(clean.npcs[0].aliases), ['小晴']);
assert.equal(clean.npcs[0].first_seen, undefined, 'model output cannot own first-seen metadata');
assert.equal(clean.npcs[0].notes, undefined);
assert.equal(clean.npcs[0].personality, undefined);
GameState.applyUpdate(clean);

npc = GameState.current.npcs[0];
assert.equal(npc.appearance, '短黑髮、左眉尾有淡痣');
assert.equal(npc.outfit, '深藍套裝');
assert.equal(npc.presence, 'away');
assert.deepEqual(Array.from(npc.aliases), ['阿晴', '林記者', '小晴']);

const lastingChange = BAOHelperData.stateUpdate({ npcs: [{
  npc_id: 'npc-1', name: '林慕晴', appearance: '短黑髮剪至耳下、左眉尾有淡痣', appearance_change: true
}] }, []);
GameState.applyUpdate(lastingChange);
assert.equal(GameState.current.npcs[0].appearance, '短黑髮剪至耳下、左眉尾有淡痣',
  'an explicitly established lasting change may update the appearance anchor');

GameState.upsertNPC({ name: '林小姐', aliases: ['小晴'], outfit: '黑色大衣' });
assert.equal(GameState.current.npcs.length, 2, 'a shared known alias should merge with the canonical NPC instead of creating a duplicate');
assert.equal(GameState.current.npcs[0].outfit, '黑色大衣');

GameState.current.npcs = [
  { name: '舊存檔缺 ID 人物' },
  { npc_id: 'npc-1', name: '既有人物' }
];
GameState.current.nextNPCSeq = 1;
GameState.ensureNPCIds();
assert.equal(GameState.current.npcs[1].npc_id, 'npc-1', 'legacy backfill must preserve an existing stable ID even when an unassigned NPC appears first');
assert.equal(GameState.current.npcs[0].npc_id, 'npc-2');

GameState.create(character, context.App.config);
GameState.upsertNPC({ name: '阿晴', aliases: ['林記者'] });
GameState.applyUpdate(clean);
GameState.applyUpdate(lastingChange);

const snapshot = WorldStateEngine.stateSnapshot();
assert.equal(snapshot.npcs[0].npc_id, 'npc-1');
assert.equal(snapshot.npcs[0].appearance, '短黑髮剪至耳下、左眉尾有淡痣');
assert.equal(snapshot.npcs[0].outfit, '深藍套裝');
assert.deepEqual(Array.from(snapshot.npcs[0].aliases), ['阿晴', '林記者', '小晴']);
assert.equal(snapshot.npcs[0].first_seen.location, '月台');

const prompt = CharacterEngine.composeSystemPrompt(character, {
  persona: { name: '玩家' },
  storyNPCs: GameState.current.npcs,
  recentMessages: [{ role: 'user', content: '我想找阿晴談談。' }],
  currentLocation: '候車室'
});
assert.match(prompt, /別名：阿晴、林記者、小晴/);
assert.match(prompt, /固定外貌：短黑髮剪至耳下、左眉尾有淡痣/);
assert.match(prompt, /當前穿著：深藍套裝/);

const sameModel = source('js/same-model-state-merge.js');
assert.match(sameModel, /aliases/);
assert.match(sameModel, /既有 appearance 必須沿用/);
assert.match(sameModel, /first_seen 由系統建立/);

console.log('NPC continuity core: canonical aliases, stable appearance, current outfit and system-owned first-seen metadata passed');

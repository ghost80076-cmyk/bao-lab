const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file });
global.window = global;
global.navigator = { userAgent: 'Node test runner' };
global.matchMedia = () => ({ matches: false });
global.MutationObserver = class { observe() {} };
global.document = {
  body: {},
  getElementById: id => id === 'bao-story-integrity-styles' ? {} : null,
  querySelector: () => null,
  createElement: () => ({ querySelector: () => null })
};
global.App = {
  config: {},
  characters: [],
  activeCharacter: null,
  renderUIPanel: () => {},
  renderChatShell: () => {},
  openCharacter: () => {}
};
global.Chat = { messages: [] };
global.Storage = { restoreStory: () => false };
global.API = { send: async () => ({ text: '{}' }) };
run('js/state.js');
run('js/world-state.js');
run('js/character-status.js');
run('js/helper-data.js');
global.GameState = GameState;
global.WorldStateEngine = WorldStateEngine;

const card = {
  id: 'autonomous-npc-world', name: '自主NPC世界(成熟內容支援)',
  initial_state: { time: '未設定', location: '未設定', events: [], npcs: [] }
};
App.characters = [card];
App.activeCharacter = card;
run('js/story-integrity-fixes.js');
run('js/state-tracker-repairs.js');
assert.equal(BAOCharacterStatus.configFor(card).fields.length, 3, 'world template gets defined tracked fields');
assert.deepEqual(BAOCharacterStatus.configFor(card).fields.map(field => field.default),
  ['未確認', '未確認', '未確認'], 'unknown is not fabricated into a numeric trust score');
GameState.create(card, App.config);
assert.deepEqual(GameState.current.events, [], 'placeholder event is not a story event');
GameState.addEvent('玩家與 自主NPC世界(成熟內容支援) 完成一輪互動。');
assert.equal(GameState.current.events.length, 0, 'synthetic turn counter is ignored');
GameState.upsertNPC({ name: '林慕晴', role: '主要NPC' });
assert.equal(GameState.current.characterStatuses['林慕晴'].trust, '未確認');

const valid = BAOHelperData.stateUpdate({
  new_events: ['林慕晴抵達辦公室。', '林慕晴離開辦公室。'],
  npcs: [{ name: '林慕晴', mood: '警惕', location: '走廊' }],
  character_statuses: {
    '林慕晴': { current_activity: '走出辦公室', trust: '未確認', unknown: '不應存入' },
    '不存在的人': { trust: '信任' }
  }
}, []);
assert.deepEqual(valid.new_events, ['林慕晴抵達辦公室。', '林慕晴離開辦公室。']);
assert.equal(valid.character_statuses['不存在的人'], undefined, 'unknown NPC data is rejected');
GameState.applyUpdate(valid);
assert.deepEqual(GameState.current.events.map(event => event.text),
  ['林慕晴離開辦公室。', '林慕晴抵達辦公室。'], 'newest confirmed event is first');
assert.equal(GameState.current.characterStatuses['林慕晴'].current_activity, '走出辦公室');
assert.equal(GameState.current.characterStatuses['林慕晴'].unknown, undefined);
assert.equal(GameState.current.npcs[0].location, '走廊');
assert.equal(GameState.current.events[0].turn, 0);
assert.equal(GameState.current.events[0].source, 'state-model');
assert.ok(GameState.current.events[0].id);
GameState.applyUpdate(valid);
assert.equal(GameState.current.events.length, 2, 'replayed state patches do not duplicate events');
GameState.applyUpdate({ location: '集團大廳' });
assert.equal(GameState.current.characterStatuses['林慕晴'].current_activity, '走出辦公室',
  'partial patches preserve prior fields');
assert.equal(GameState.current.location, '集團大廳');

console.log('story integrity and NPC state core test passed');

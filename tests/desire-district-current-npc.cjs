const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.App = { config: {}, activeCharacter: null };
global.API = { send: async () => ({ text: '{}' }) };
const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file });
run('js/state.js');
run('js/world-state.js');
run('js/character-status.js');
run('js/helper-data.js');
run('js/character.js');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/characters/general/desire-district.json'), 'utf8'));
const card = CharacterEngine.normalize(raw);
App.activeCharacter = card;
GameState.create(card, App.config);
assert.equal(GameState.current.npcs[0].name, '貓姐兒');
assert.equal(GameState.current.npcs[0].presence, 'present');
assert.deepEqual(Object.keys(GameState.current.characterStatuses), ['貓姐兒']);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我看看登記處的環境'), ['貓姐兒']);
const data = BAOHelperData.stateUpdate({ location: '霓港島・中等區・夜鶯會所', npcs: [
  { name: '貓姐兒', presence: 'away' },
  { name: '阿薇', role: '會所經理', location: '霓港島・中等區・夜鶯會所', presence: 'present' }
]}, []);
assert.equal(data.npcs[0].presence, 'away');
GameState.applyUpdate(data);
assert.equal(GameState.current.npcs.find(n => n.name === '貓姐兒').presence, 'away');
assert.equal(GameState.current.characterStatuses['貓姐兒'].identity.includes('32歲'), true);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我看看這間店'), ['阿薇']);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我想打電話找貓姐兒')[0], '貓姐兒');
GameState.applyUpdate({ location: '霓港島・慾望街區入口・登記處', npcs: [{ name: '貓姐兒', presence: 'present' }, { name: '阿薇', presence: 'away' }] });
assert.deepEqual(BAOCharacterStatus.namesForTurn('我回到入口'), ['貓姐兒']);
assert.ok(!JSON.stringify(raw.content).includes('未成年'));
console.log('Desire District current NPC scene switch and adult-only prompt checks passed.');

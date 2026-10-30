const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.window = global;
global.document = { querySelector: () => null };
const defs = [
  { id: 'economy', label: '資產', kind: 'object', tracking: 'medium', context: 'core', fields: [{ key: 'gold', type: 'number' }, { key: 'currency', type: 'text' }] },
  { id: 'inventory', label: '背包', kind: 'collection', tracking: 'low', context: 'ui_only', fields: [{ key: 'id', type: 'text' }, { key: 'name', type: 'text' }, { key: 'quantity', type: 'number' }] },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `page${i}`, label: `分頁${i}`, kind: 'object', tracking: 'low', context: 'ui_only', fields: [{ key: 'value', type: 'text' }] })),
  { id: 'notes', label: '手動', kind: 'object', tracking: 'manual', fields: [{ key: 'text', type: 'text' }] }
];
const fresh = () => ({ time: '早上', location: '商店', npcs: [], characterStatuses: {}, events: [], pendingStateTurns: [], moduleDefinitions: defs,
  modules: { economy: { gold: 100, currency: '金幣', player_note: '保留' }, inventory: [{ id: 'potion', name: '藥水', quantity: 1, player_note: '保留' }, { id: 'key', name: '鑰匙', quantity: 1 }], notes: { text: '手寫' },
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`page${i}`, { value: '原值' }])) } });
global.GameState = { current: fresh(), applyUpdate(data) { for (const key of ['time', 'location']) if (data[key]) this.current[key] = data[key]; Object.assign(this.current.modules, data.modules); } };
global.App = { config: { api: { key: 'mock', model: 'mock', baseUrl: 'https://example.invalid' }, cost: { stateApiMode: 'same' } }, activeCharacter: { name: '旅人' }, renderChatShell() {}, saveStory() { return true; } };
global.Chat = { messages: [], summary: '' };
global.WorldStateEngine = { enabled: () => true, update: async () => ({}), parse: JSON.parse, stateSnapshot: () => ({ time: GameState.current.time, location: GameState.current.location, modules: GameState.current.modules }) };
vm.runInThisContext(fs.readFileSync('js/helper-data.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('js/world-state-cost.js', 'utf8'));
let raw, narration, requests = [];
global.API = { send: async (_cfg, messages) => { requests.push(messages); return { text: narration + '<BAO_STATE>' + JSON.stringify(raw) + '</BAO_STATE>' }; } };
vm.runInThisContext(fs.readFileSync('js/same-model-state-merge.js', 'utf8'));
const allChecks = () => ({ economy: ['currency'], inventory: true, ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`page${i}`, ['value']])) });
async function turn(player, story, patch) {
  Chat.messages.push({ role: 'user', content: player }); narration = story; raw = patch;
  const result = await API.send(App.config.api, [{ role: 'user', content: player }]);
  assert.equal(result.text, story);
  Chat.messages.push({ role: 'assistant', content: story });
  await WorldStateEngine.update(App.config, player, story);
}
(async () => {
  await turn('繼續', '中午，你花了二十金幣買到麵包，抵達城門。', { time: '中午', location: '城門', modules: { economy: { gold: 80 }, inventory: [{ id: 'bread', name: '麵包', quantity: 1 }] }, module_checks: allChecks() });
  const contract = requests[0][0].content;
  assert(contract.includes('"page9"'), 'more than eight schemas and unmentioned/ui_only pages are offered before generation');
  const schema = JSON.parse(contract.split('【可更新世界模組】\n')[1].split('\n\n')[0]);
  assert.equal(Object.keys(schema).length, 12);
  assert.equal(schema.notes, undefined, 'manual module is never offered');
  assert.equal(GameState.current.time, '中午'); assert.equal(GameState.current.location, '城門');
  assert.equal(GameState.current.modules.economy.gold, 80);
  assert.equal(GameState.current.modules.inventory.length, 3, 'new item does not replace existing backpack');
  assert.equal(GameState.current.stateTracker.phase, 'updated');
  assert.equal(GameState.current.pendingStateTurns.length, 0);
  assert.equal(requests.length, 1, 'story plus every page uses one request');
  await turn('喝藥水', '你喝完最後一瓶藥水。', { scene_checks: ['time', 'location'], modules: {}, module_removals: { inventory: [{ id: 'potion', evidence: '你喝完最後一瓶藥水。' }] }, module_checks: { ...allChecks(), economy: ['gold', 'currency'] } });
  assert.deepEqual(GameState.current.modules.inventory.map(i => i.id), ['key', 'bread']);
  assert.equal(GameState.current.modules.economy.gold, 80, 'consumption cannot restore old balance');
  assert.equal(GameState.current.stateTracker.phase, 'updated');
  // A real scene update does not certify omitted pages, even for valid JSON.
  await turn('往前走', '你已經到旅館。', { time: '夜晚', location: '旅館', modules: { economy: { gold: 0 } } });
  assert.equal(GameState.current.modules.economy.gold, 0, 'zero is an explicit absolute value, not missing evidence');
  assert.equal(GameState.current.stateTracker.phase, 'partial');
  assert.equal(GameState.current.pendingStateTurns.length, 1);
  assert(GameState.current.stateRequestDiagnostics.unconfirmedModules.includes('inventory'));
  const saved = JSON.stringify(GameState.current); GameState.current = JSON.parse(saved);
  assert.equal(GameState.current.modules.economy.gold, 0);
  assert(!GameState.current.modules.inventory.some(i => i.id === 'potion'));
  assert.equal(GameState.current.pendingStateTurns.length, 1);
  // Read-only/manual fields and unsupported deletions are preserved.
  const invalid = { modules: { economy: { gold: '999' }, notes: { text: '覆寫' } }, module_checks: { economy: ['gold', 'currency'], inventory: true }, module_removals: { inventory: [{ id: 'key', evidence: '你丟掉鑰匙。' }] } };
  const checked = BAOHelperData.stateUpdate(invalid, defs, '你拿著鑰匙。', { collectionMode: 'merge', removalEvidence: '你拿著鑰匙。' });
  assert.equal(checked.modules.notes, undefined);
  assert.equal(checked.modules.economy, undefined);
  assert(BAOHelperData.moduleCoverage(invalid, checked, defs).includes('inventory'), 'fabricated removal cannot certify a collection');
  assert(BAOHelperData.moduleCoverage(invalid, checked, defs).includes('economy'), 'invalid returned number cannot be disguised as unchanged');
  const playerOnly = BAOHelperData.stateUpdate({ module_removals: { inventory: [{ id: 'key', evidence: '丟掉鑰匙' }] } }, defs, '丟掉鑰匙\n你仍拿著鑰匙。', { collectionMode: 'merge', removalEvidence: '你仍拿著鑰匙。' });
  assert.equal(playerOnly.modules.inventory, undefined, 'player intent alone is not completed consumption');
  const olderRemoval = BAOHelperData.stateUpdate({ module_removals: { inventory: [{ id: 'key', evidence: '你丟掉鑰匙。' }] } }, defs, '你丟掉鑰匙。\n你又撿回鑰匙。', { collectionMode: 'merge' });
  assert.equal(olderRemoval.modules.inventory, undefined, 'older removal cannot undo a later reacquisition mention');
  assert.deepEqual(BAOHelperData.sceneCoverage({ time: '未確認', scene_checks: ['time', 'location'] }), ['time'], 'unknown scene values cannot be disguised as unchanged');
  assert.deepEqual(BAOHelperData.sceneCoverage({ time: 123, scene_checks: ['time', 'location'] }), ['time']);
  assert.deepEqual(BAOHelperData.sceneCoverage({ scene_checks: 'time location' }), ['time', 'location']);
  // Rebuild uses live unsaved history, absolute balances and explicit removals.
  GameState.current = fresh();
  Chat.messages = [{ role: 'user', content: '購買麵包後喝藥' }, { role: 'assistant', content: '金幣剩八十枚。你喝完最後一瓶藥水。' }];
  API.send = async (_cfg, messages) => {
    requests.push(messages);
    assert(messages[1].content.includes('module_removals'));
    assert(!messages[1].content.includes('"gold":100'), 'stale numeric values do not become rebuilding evidence');
    return { text: JSON.stringify({ time: '中午', location: '城門', npcs: [], character_statuses: {}, modules: { economy: { gold: 80 } }, module_removals: { inventory: [{ id: 'potion', evidence: '你喝完最後一瓶藥水。' }] }, module_checks: allChecks() }) };
  };
  await WorldStateEngine.rebuild(App.config, 'deep');
  assert.equal(GameState.current.modules.economy.gold, 80);
  assert.deepEqual(GameState.current.modules.inventory.map(i => i.id), ['key']);
  assert.equal(GameState.current.modules.economy.player_note, '保留');
  assert.equal(GameState.current.modules.notes.text, '手寫');
  assert(GameState.current.stateRebuildBackup.modules.inventory.some(i => i.id === 'potion'));
  // Running the same evidence again must neither spend again nor revive items.
  await WorldStateEngine.rebuild(App.config, 'deep');
  assert.equal(GameState.current.modules.economy.gold, 80);
  assert.deepEqual(GameState.current.modules.inventory.map(i => i.id), ['key']);
  assert.equal(GameState.current.stateTracker.phase, 'partial', 'unresolvable repeated removal is disclosed conservatively');
  global.BAOCharacterStatus = { configFor: () => ({ enabled: true, fields: [{ key: 'score', type: 'number', track: true }] }) };
  const badCharacter = { character_statuses: { '旅人': { score: '99' } }, character_checks: { '旅人': ['score'] } };
  const normalizedCharacter = BAOHelperData.stateUpdate(badCharacter);
  assert.deepEqual(BAOHelperData.characterCoverage(badCharacter, normalizedCharacter, { '旅人': { score: 5 } }), ['旅人']);
  const zeroCharacter = { character_statuses: { '旅人': { score: 0 } } };
  assert.deepEqual(BAOHelperData.characterCoverage(zeroCharacter, BAOHelperData.stateUpdate(zeroCharacter), { '旅人': { score: 5 } }), []);
  BAOCharacterStatus.configFor = () => ({ enabled: false, fields: [{ key: 'score', type: 'number', track: true }] });
  assert.deepEqual(BAOHelperData.stateUpdate(zeroCharacter).character_statuses['旅人'], {});
  console.log('state module integrity: all pages, money, inventory, consumption, partial coverage and rebuild passed');
})().catch(e => { console.error(e); process.exitCode = 1; });

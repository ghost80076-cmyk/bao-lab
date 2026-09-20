const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const state = { npcs: [
  { name: '阿青', presence: 'away', location: '市場' },
  { name: '小林', presence: 'present', location: '咖啡廳' },
  { name: '小周', presence: 'unknown' },
  { name: '未追蹤', location: '碼頭' }
] };
const calls = [];
const ctx = { console, window: null,
  App: { characters: [], activeCharacter: { id: 'other-world' }, renderChatShell() {}, renderUIPanel() {} },
  GameState: { current: state },
  BAOCharacterStatus: { ensureState() {} },
  BAOHelperData: { stateUpdate(data) { return data; } },
  WorldStateEngine: { stateSnapshot() {
    return { npcs: state.npcs.map(npc => ({ name: npc.name, location: npc.location })), recent_events: [{ text: '返回市場' }] };
  }, async update() { return {}; } },
  API: { async send(config, messages) { calls.push({ config, messages }); return { text: '{}' }; } },
  document: { getElementById() { return null; }, createElement() { throw Error('unexpected DOM use'); } }
};
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/state-tracker-repairs.js'), 'utf8'), ctx);
const snapshot = ctx.WorldStateEngine.stateSnapshot();
assert.deepEqual(Array.from(snapshot.npcs, npc => npc.presence || 'unset'), ['away', 'present', 'unknown', 'unset']);
assert.equal(snapshot.recent_events[0], '返回市場');
assert.equal(state.npcs[0].presence, 'away', 'the snapshot must not mutate the saved state');
(async () => {
  const normal = [{ role: 'system', content: '普通對話' }];
  await ctx.API.send({ model: 'main' }, normal);
  assert.equal(calls[0].messages, normal, 'main model messages must not be modified');
  const helper = [{ role: 'system', content: '只輸出 JSON' }, { role: 'user', content: '更新 NPC' }];
  await ctx.API.send({ __stateTask: true }, helper);
  assert.match(calls[1].messages[0].content, /presence/);
  assert.match(calls[1].messages[0].content, /away/);
  assert.match(calls[1].messages[0].content, /只在確有變化時/);
  assert.equal(calls[1].messages[1].content, '更新 NPC');
  assert.equal(helper[0].content, '只輸出 JSON', 'do not rewrite the original prompt');
  console.log('NPC presence regression: PASS (snapshot, no inference, helper-only prompt, main request isolation)');
})().catch(error => { console.error(error); process.exitCode = 1; });

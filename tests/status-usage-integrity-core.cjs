const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const title = '自主NPC世界(成熟內容支援)';
const calls = [];
const status = {
  snapshotForTracker: () => ({ [title]: { energy: 100 }, '林慕晴': { energy: 70 } }),
  compactForPrompt: () => ({ names: [title, '林慕晴'], text: `${title}：精力=100\n林慕晴：精力=70` })
};
const chat = {
  messages: [], usage: { prompt: 0, completion: 0 },
  addUsage: () => {}, renderUsage: () => {}, renderTurnUsage: () => {}, reset: () => {}
};
const app = {
  activeCharacter: { id: 'autonomous-npc-world', name: title },
  config: { cost: {}, persona: { name: '未命名玩家' } },
  escapeHTML: value => value,
  renderUIPanel: () => {}, renderChatShell: () => {}
};
const state = { npcs: [] };
const gameState = {
  current: state,
  upsertNPC: npc => { if (!state.npcs.some(x => x.name === npc.name)) state.npcs.push(npc); }
};
const sandbox = {
  document: { querySelector: () => null, getElementById: () => null },
  App: app, GameState: gameState, BAOCharacterStatus: status,
  WorldStateEngine: {}, Chat: chat,
  API: { send: async (config, messages) => { calls.push({ config, messages }); return { text: '{}' }; } }
};
sandbox.window = sandbox;
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'status-usage-integrity.js'), 'utf8');
vm.runInNewContext(source, sandbox, { filename: 'js/status-usage-integrity.js' });
assert.ok(sandbox.BAOStatusUsageIntegrity, 'diagnostics module must load');
assert.deepEqual(Object.keys(status.snapshotForTracker()), ['林慕晴'], 'world template is not a tracked NPC');
const compact = status.compactForPrompt();
assert.deepEqual(Array.from(compact.names), ['林慕晴']);
assert.doesNotMatch(compact.text, /自主NPC世界/);
const newNames = sandbox.BAOStatusUsageIntegrity.registerNamedNPCs('林慕晴：「你好」\n未命名玩家：「回答」\n時間：「晚上」');
assert.equal(newNames, 1, 'only an explicit NPC speaker should be registered');
assert.deepEqual(state.npcs.map(npc => npc.name), ['林慕晴']);
assert.equal(sandbox.BAOStatusUsageIntegrity.registerNamedNPCs('林慕晴：「又見面了」'), 0, 'repeated dialogue must not create duplicate NPCs');
(async () => {
  await sandbox.API.send({ __stateTask: true }, [{ role: 'system', content: '只做狀態整理' }, { role: 'user', content: '林慕晴：你好' }]);
  assert.match(calls[0].messages[0].content, /具名 NPC/);
  assert.match(calls[0].messages[0].content, /不要把角色卡／世界模板名稱當成 NPC/);
  await sandbox.API.send({}, [{ role: 'user', content: '正常回覆' }]);
  assert.equal(calls[1].messages[0].content, '正常回覆', 'ordinary story payload must remain unchanged');
  console.log('status usage integrity core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

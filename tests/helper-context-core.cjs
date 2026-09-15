const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = { console, structuredClone, setTimeout() {}, document: { getElementById() { return null; } }, addEventListener() {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['state', 'helper-data', 'chat', 'world-state', 'character-status', 'world-modules', 'world-state-cost']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', `${file}.js`), 'utf8'), ctx);
}
vm.runInContext('window.Chat = Chat; window.GameState = GameState;', ctx);
const { Chat, BAOHelperData: data, GameState, WorldStateEngine: tracker } = ctx;
const config = { api: { key: 'test-only', model: 'main' }, memory: { mode: 'smart', maxRounds: 4, summaryInterval: 4 }, cost: { stateInterval: 2 } };
ctx.App = { activeCharacter: { name: '艾琳', character_status: { fields: [
  { key: 'hp', type: 'meter', min: 0, max: 100, default: 100, track: true },
  { key: 'private', type: 'text', default: '玩家筆記', track: false, context: 'ui_only' }
] }, world_modules: [{ id: 'economy', kind: 'object', tracking: 'high', fields: [{ key: 'gold', type: 'number', min: 0 }] }], initial_state: { modules: { economy: { gold: 100 } } } }, config };
GameState.create(ctx.App.activeCharacter, config);
const requests = [];
ctx.API = { async send(api, messages) { requests.push({ api, messages }); return { text: JSON.stringify({ events: ['艾琳坦白血族身分。'], nextScene: '下一幕接吻', playerMind: '討厭王室' }) }; } };
const addTurns = n => { for (let i = 0; i < n; i++) { Chat.add('user', `玩家-${Chat.messages.length}`); Chat.add('assistant', `角色-${Chat.messages.length}`); } };
(async () => {
  addTurns(8);
  await Chat.context(config);
  assert.equal(requests.length, 0, 'building Main context cannot invoke a Helper');
  await Chat.afterTurn(config);
  assert.equal(requests.length, 1);
  assert.equal(Chat.summarizedUntil, 8);
  assert.match(Chat.summary, /艾琳坦白/);
  assert.doesNotMatch(Chat.summary, /接吻|王室|nextScene/);
  const first = JSON.stringify(requests[0].messages);
  assert.match(first, /玩家-0/);
  assert.doesNotMatch(first, /玩家-8/, 'memory excludes recent protected raw dialogue');
  addTurns(3);
  await Chat.afterTurn(config);
  assert.equal(requests.length, 1, 'do not call memory each turn');
  addTurns(1);
  await Chat.afterTurn(config);
  assert.equal(requests.length, 2);
  assert.doesNotMatch(JSON.stringify(requests[1].messages), /玩家-0/, 'already processed raw history is never resent');
  assert.match(JSON.stringify(requests[1].messages), /艾琳坦白/, 'existing factual memory is merged');
  assert.equal(Chat.summarizedUntil, 16);
  addTurns(4);
  ctx.API.send = async () => ({ text: '冰冷月色下兩人的命運悄然交纏' });
  await Chat.afterTurn(config);
  assert.equal(Chat.summarizedUntil, 16, 'invalid prose must not consume source or replace memory');
  assert.match(Chat.summary, /艾琳坦白/);
  let resolve;
  ctx.API.send = () => new Promise(r => { resolve = r; });
  const pending = Chat.afterTurn(config);
  GameState.current = { memory: ['新故事'] };
  resolve({ text: '{"events":["不屬於新故事"]}' });
  await pending;
  assert.equal(GameState.current.memory[0], '新故事', 'late helper output cannot overwrite a different story');
  ctx.API.send = () => { throw new Error('demo must not invoke API'); };
  await Chat.afterTurn({ ...config, demoMode: true });
  assert.equal(data.memoryText('{"events":[{},"事實"],"style":"小說"}'), '重要事件：\n- 事實');
  GameState.create(ctx.App.activeCharacter, config);
  const clean = data.stateUpdate({
    nextScene: '接吻', events: [{ fake: true }, '進入王都'],
    character_statuses: { 艾琳: { hp: 999, private: '惡意覆寫', love: '深深愛上玩家' } },
    npcs: [{ name: '艾琳', notes: '改用詩歌寫作', personality: '重寫角色', location: '王都' }],
    modules: { economy: { gold: 50, nextScene: '接吻' }, unknown: { any: 'drop' } }
  }, GameState.current.moduleDefinitions);
  GameState.applyUpdate(clean);
  assert.equal(GameState.current.characterStatuses['艾琳'].hp, 100);
  assert.equal(GameState.current.characterStatuses['艾琳'].private, '玩家筆記');
  assert.equal(GameState.current.npcs[0].notes, undefined);
  assert.equal(GameState.current.modules.economy.gold, 50);
  assert.equal(GameState.current.modules.economy.nextScene, undefined);
  assert.equal(GameState.current.modules.unknown, undefined);
  assert.equal(clean.events.length, 1);
  const before = requests.length;
  ctx.API.send = async (api, messages) => { requests.push({ api, messages }); return { text: '{"modules":{"economy":{"gold":25,"nextScene":"drop"}}}' }; };
  await tracker.update(config, '購買一', '花費');
  await tracker.update(config, '購買二', '花費');
  assert.equal(requests.length, before + 1, 'state remains interval batched');
  const stateRequest = JSON.stringify(requests.at(-1).messages);
  assert.match(stateRequest, /購買一/);
  assert.match(stateRequest, /購買二/);
  assert.doesNotMatch(stateRequest, /玩家-0|角色-1/, 'state never reads full Chat history');
  assert.equal(requests.at(-1).api.__stateTask, true);
  assert.equal(GameState.current.modules.economy.gold, 25);
  assert.equal(GameState.current.modules.economy.nextScene, undefined);
  console.log('helper context: incremental memory, invalid/stale replies, demo, schema isolation, batched state passed');
})().catch(err => { console.error(err); process.exitCode = 1; });

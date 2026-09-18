const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
let saves = 0;
let helperCalls = 0;
global.GameState = {
  current: { time: '未設定', location: '未設定' },
  applyUpdate(patch) { Object.assign(this.current, patch); }
};
global.Chat = { messages: [] };
global.App = {
  renderChatShell() { return 'rendered'; },
  saveStory() { saves += 1; }
};
global.WorldStateEngine = {
  enabled: () => true,
  async update() { helperCalls += 1; return null; }
};
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'world-state-cost.js'), 'utf8');
vm.runInThisContext(source, { filename: 'js/world-state-cost.js' });

const metadata = `雨水從衣領滑落。\n---\n**當前場景資訊：**\n\n* **時間：** 22:14（深夜）\n* **地點：** 下層區・灰網巷（老周麵館後方）\n* **天氣：** 大雨\n* **附近 NPC：** 凱倫（接頭人）\n\n你正在巷口。`;
const earlier = `---\n**當前場景資訊：**\n* **時間：** 21:00\n* **地點：** 舊碼頭`;
const config = { narrativeMode: 'world', api: { key: 'mock-only' }, cost: { stateInterval: 3 } };

(async () => {
  assert.deepEqual(WorldStateEngine.explicitSceneInfo('普通劇情：時間：22:14、地點：巷口。'), null);
  assert.deepEqual(WorldStateEngine.explicitSceneInfo('時間：22:14\n地點：巷口'), null);
  assert.deepEqual(WorldStateEngine.explicitSceneInfo(metadata), {
    time: '22:14（深夜）', location: '下層區・灰網巷（老周麵館後方）'
  });
  assert.deepEqual(WorldStateEngine.explicitSceneInfo('**當前場景資訊：**\n* **時間：** 未設定\n* **地點：** 未知'), null);
  console.log('PASS: marked scene fields parsed, unmarked prose and placeholders ignored');

  const immediate = await WorldStateEngine.update(config, '繼續', metadata);
  assert.deepEqual(immediate, { time: '22:14（深夜）', location: '下層區・灰網巷（老周麵館後方）' });
  assert.equal(GameState.current.time, '22:14（深夜）');
  assert.equal(GameState.current.location, '下層區・灰網巷（老周麵館後方）');
  assert.equal(GameState.current.stateTracker.phase, 'waiting');
  assert.equal(helperCalls, 0, 'explicit time/location must not call any additional API');
  assert.equal(GameState.current.pendingStateTurns.length, 1, 'the independent state tracker remains queued');
  console.log('PASS: current world state updates immediately while helper API waits');

  GameState.current = { time: '未設定', location: '未設定' };
  Chat.messages = [
    { role: 'assistant', content: earlier },
    { role: 'user', content: '繼續' },
    { role: 'assistant', content: metadata }
  ];
  assert.equal(App.renderChatShell(), 'rendered');
  await Promise.resolve();
  assert.equal(GameState.current.time, '22:14（深夜）');
  assert.equal(GameState.current.location, '下層區・灰網巷（老周麵館後方）');
  assert.equal(saves, 1, 'recovered fields should be persisted');
  App.renderChatShell();
  await Promise.resolve();
  assert.equal(saves, 1, 'repeated redraw must not rewrite the save again');
  console.log('PASS: existing stories recover newest explicit fields once and persist them');

  GameState.current = { time: '23:00', location: '新碼頭' };
  App.renderChatShell();
  await Promise.resolve();
  assert.equal(GameState.current.time, '23:00');
  assert.equal(GameState.current.location, '新碼頭');
  assert.equal(saves, 1);
  assert.equal(helperCalls, 0);
  console.log('PASS: established saved state is never overwritten by older dialogue');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sent = [];
let separateUpdates = 0;
let providerMode = 'normal';
const owner = { pendingStateTurns: [], moduleDefinitions: [], time: '晚上', location: '房間', events: [], npcs: [] };
const TURN_ANCHOR = '【本輪】依玩家最新輸入延續一輪；保持已確認事實與資訊邊界，不代寫玩家。';
const orchestrated = text => `${text}\n\n${TURN_ANCHOR}`;

global.window = global;
global.document = {};
global.GameState = {
  current: owner,
  applyUpdate(update) {
    if (update.time) this.current.time = update.time;
    if (update.location) this.current.location = update.location;
    if (Array.isArray(update.events)) this.current.events.unshift(...update.events);
  }
};
global.Chat = { messages: [] };
global.BAOHelperData = {
  moduleSchemas: () => ({}),
  stateUpdate: data => data && typeof data === 'object' && !Array.isArray(data) ? data : null
};
global.WorldStateEngine = {
  enabled: () => true,
  interval: config => Number(config?.cost?.stateInterval || 2),
  stateSnapshot: () => ({ time: GameState.current.time, location: GameState.current.location }),
  parse(text) { try { return JSON.parse(String(text).trim()); } catch { return null; } },
  markPersistenceHint() {},
  syncExplicitScene() { return null; },
  async update() { separateUpdates += 1; return { separate: true }; }
};
global.App = {
  activeCharacter: { name: '角色' },
  config: {
    narrativeMode: 'world',
    api: { model: 'gemini-test', baseUrl: 'https://example.test/v1', protocol: 'openai', key: 'x' },
    cost: { stateInterval: 2, stateModel: '' }
  }
};
global.API = {
  __sendWrapperIds: new Set(),
  async send(config, messages) {
    sent.push({ config, messages });
    const withContract = JSON.stringify(messages).includes('BAO_STATE_V1');
    if (typeof config.onDelta === 'function' && withContract) {
      const chunks = providerMode === 'missing'
        ? ['故事缺狀態']
        : ['故事二', '故事二<BA', '故事二<BAO_STATE>', '故事二<BAO_STATE>{"time":"午夜"}'];
      let previous = '';
      for (const full of chunks) {
        config.onDelta(full.slice(previous.length), full);
        previous = full;
      }
    }
    if (!withContract) return { text: '故事一', usage: {} };
    if (providerMode === 'missing') return { text: '故事缺狀態', usage: {} };
    return { text: '故事二\n<BAO_STATE>{"time":"午夜","events":["門打開"]}</BAO_STATE>', usage: {} };
  },
  wrapSend(id, wrapper) {
    if (this.__sendWrapperIds.has(id)) return false;
    const next = this.send.bind(this);
    this.send = (config, messages, ...rest) => wrapper(next, config, messages, ...rest);
    this.__sendWrapperIds.add(id);
    return true;
  }
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'same-model-state-merge.js'), 'utf8'), { filename: 'js/same-model-state-merge.js' });
assert.equal(API.__sendWrapperIds.has('same-model-state-merge:main-story'), true, 'same-model merge must install through API.wrapSend');

(async () => {
  Chat.messages.push({ role: 'user', content: '第一輪' });
  let result = await API.send(App.config.api, [{ role: 'user', content: orchestrated('第一輪') }]);
  assert.equal(result.text, '故事一');
  assert.equal(JSON.stringify(sent[0].messages).includes('BAO_STATE_V1'), false, 'first turn should not add state output before interval');
  await WorldStateEngine.update(App.config, '第一輪', '故事一');
  assert.equal(separateUpdates, 0, 'same-model mode must not fire a second state API');
  assert.equal(owner.pendingStateTurns.length, 1);
  assert.equal(owner.stateTracker.phase, 'waiting');

  Chat.messages.push({ role: 'assistant', content: '故事一' }, { role: 'user', content: '第二輪' });
  const streamed = [];
  assert.equal(BAOSameModelStateMerge.isMainStoryRequest(App.config.api, [{ role: 'user', content: orchestrated('第二輪') }]), true,
    'prompt orchestrator turn anchor must still count as the current main story request');
  assert.equal(BAOSameModelStateMerge.isMainStoryRequest(App.config.api, [{ role: 'user', content: '第二輪錯誤前綴' }]), false,
    'latest-user prefix matching must keep a newline boundary');
  result = await API.send({ ...App.config.api, onDelta: (_delta, full) => streamed.push(full) }, [{ role: 'user', content: orchestrated('第二輪') }]);
  assert.equal(result.text, '故事二', 'state appendix must be stripped from committed story text');
  assert.match(JSON.stringify(sent[1].messages), /BAO_STATE_V1/, 'due turn should request state inside the main story call');
  assert.ok(streamed.every(text => !text.includes('<BAO_STATE>') && !text.includes('{"time"')), 'stream preview must never expose machine state appendix');
  const update = await WorldStateEngine.update(App.config, '第二輪', '故事二');
  assert.equal(separateUpdates, 0);
  assert.equal(owner.time, '午夜');
  assert.deepEqual(owner.events, ['門打開']);
  assert.equal(owner.pendingStateTurns.length, 0);
  assert.equal(owner.stateTracker.phase, 'updated');
  assert.equal(update.time, '午夜');

  // Missing/invalid merged state keeps the story and queues the turn instead of
  // silently issuing a second API request.
  providerMode = 'missing';
  owner.pendingStateTurns.push({ player: '舊輪', assistant: '舊故事' });
  Chat.messages.push({ role: 'assistant', content: '故事二' }, { role: 'user', content: '第三輪' });
  const beforeMissing = sent.length;
  result = await API.send(App.config.api, [{ role: 'user', content: orchestrated('第三輪') }]);
  assert.equal(result.text, '故事缺狀態');
  assert.equal(sent.length, beforeMissing + 1);
  await WorldStateEngine.update(App.config, '第三輪', '故事缺狀態');
  assert.equal(separateUpdates, 0, 'missing appendix must not trigger a paid fallback request');
  assert.equal(owner.pendingStateTurns.length, 2);
  assert.equal(owner.stateTracker.phase, 'failed');
  assert.match(owner.stateTracker.message, /不會補發第二次 API/);

  assert.equal(BAOSameModelStateMerge.visibleText('正文<BAO_STA'), '正文');
  assert.deepEqual(BAOSameModelStateMerge.splitFinal('正文<BAO_STATE>{"location":"街道"}</BAO_STATE>'), {
    narration: '正文', stateText: '{"location":"街道"}', hasState: true
  });

  App.config.cost.stateApi = null;
  App.config.cost.stateModel = 'legacy-stale-model';
  assert.equal(BAOSameModelStateMerge.eligible(App.config), true,
    'legacy stateModel without stateApi must not disable same-model status merging');

  App.config.cost.stateApi = { model: 'gemini-test', baseUrl: 'https://example.test/v1', key: 'other' };
  assert.equal(BAOSameModelStateMerge.eligible(App.config), false, 'explicit separate state route must preserve two-request mode');
  await WorldStateEngine.update(App.config, '分開', '分開故事');
  assert.equal(separateUpdates, 1);

  console.log('same-model state merge core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

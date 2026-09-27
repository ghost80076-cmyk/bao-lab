const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sent = [];
let separateUpdates = 0;
let providerMode = 'normal';
const owner = { pendingStateTurns: [], moduleDefinitions: [], time: '晚上', location: '房間', events: [], npcs: [] };

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
  }
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'same-model-state-merge.js'), 'utf8'), { filename: 'js/same-model-state-merge.js' });

(async () => {
  Chat.messages.push({ role: 'user', content: '第一輪' });
  let result = await API.send(App.config.api, [{ role: 'user', content: '第一輪' }]);
  assert.equal(result.text, '故事一');
  assert.equal(JSON.stringify(sent[0].messages).includes('BAO_STATE_V1'), false, 'first turn should not add state output before interval');
  await WorldStateEngine.update(App.config, '第一輪', '故事一');
  assert.equal(separateUpdates, 0, 'same-model mode must not fire a second state API');
  assert.equal(owner.pendingStateTurns.length, 1);
  assert.equal(owner.stateTracker.phase, 'waiting');

  Chat.messages.push({ role: 'assistant', content: '故事一' }, { role: 'user', content: '第二輪' });
  const streamed = [];
  result = await API.send({ ...App.config.api, onDelta: (_delta, full) => streamed.push(full) }, [{ role: 'user', content: '第二輪' }]);
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
  result = await API.send(App.config.api, [{ role: 'user', content: '第三輪' }]);
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

  App.config.cost.stateApi = { model: 'gemini-test', baseUrl: 'https://example.test/v1', key: 'other' };
  assert.equal(BAOSameModelStateMerge.eligible(App.config), false, 'explicit separate state route must preserve two-request mode');
  await WorldStateEngine.update(App.config, '分開', '分開故事');
  assert.equal(separateUpdates, 1);

  console.log('same-model state merge core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

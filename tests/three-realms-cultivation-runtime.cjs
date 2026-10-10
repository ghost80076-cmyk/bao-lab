'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { console, structuredClone, setTimeout() {} };
context.window = context;
vm.createContext(context);
const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', `${file}.js`), 'utf8'), context);
for (const file of ['state', 'helper-data', 'world-state', 'three-realms-cultivation-core', 'world-modules']) load(file);
vm.runInContext('window.GameState = GameState; window.WorldStateEngine = WorldStateEngine;', context);
const { GameState, WorldStateEngine, BAOWorldModules: Modules, BAOHelperData: Helper, BAOThreeRealmsCultivation: Core } = context;
const config = { narrativeMode: 'world', displayMode: 'ui', cost: { stateInterval: 1 }, api: { model: 'mock', baseUrl: 'https://example.invalid/v1', key: 'test-only' } };
context.App = { activeCharacter: { name: '修士' }, config };
GameState.create(context.App.activeCharacter, config);
assert.equal(GameState.current.modules[Core.id], undefined, 'opt-in leaves unrelated stories alone');
Modules.applyCustomization({ enabledBuiltIns: [Core.id] });
assert.equal(Object.keys(GameState.current.modules[Core.id]).length, 0, 'unknown state has no fabricated starting rank or numbers');
assert.equal(Helper.moduleSchemas(GameState.current.moduleDefinitions)[Core.id].fields.length, Core.fields.length);
let reply = { modules: { [Core.id]: { route: '下界鬥氣', realm: '鬥宗', energy: 30, energy_max: 100, evidence: '我是鬥宗，鬥氣30，上限100' } } };
const requests = [];
context.API = {
  async send(api, messages) { requests.push({ api, messages }); return { text: JSON.stringify(reply) }; },
  wrapSend(id, wrapper) { const next = this.send.bind(this); this.send = (...args) => wrapper(next, ...args); }
};
(async () => {
  await WorldStateEngine.update(config, '我是鬥宗，鬥氣30，上限100', '師父確認了你的境界。');
  assert.equal(GameState.current.modules[Core.id].realm, '鬥宗');
  assert.match(JSON.stringify(requests[0].messages), /三界九域原生修煉狀態/);
  assert.match(Modules.compactForPrompt(), /鬥宗/);
  const first = structuredClone(GameState.current.modules[Core.id]);
  reply = { modules: { [Core.id]: { route: '上界', realm: '小神', ascension_result: '成功', evidence: '飛升' } } };
  await WorldStateEngine.update(config, '想試試飛升', '你準備飛升。');
  assert.deepEqual(GameState.current.modules[Core.id], first, 'bad cross-world update cannot corrupt state');
  assert.ok(GameState.current.cultivationUpdateWarning);
  // Actual story snapshot round-trip uses the same ensureState as Storage restore.
  GameState.current = JSON.parse(JSON.stringify(GameState.current));
  Modules.ensureState(context.App.activeCharacter);
  assert.equal(GameState.current.modules[Core.id].energy, 30);
  const restoredDefs = GameState.current.moduleDefinitions;
  const source = '飛升中界，境界化神期';
  const patch = Helper.stateUpdate({ modules: { [Core.id]: { route: '中界', realm: '化神期', ascension_result: '成功', evidence: source } } }, restoredDefs, source);
  GameState.applyUpdate(patch);
  assert.equal(GameState.current.modules[Core.id].realm, '化神期');
  assert.equal(GameState.current.cultivationUpdateWarning, '');
  assert.equal(GameState.current.modules[Core.id].energy, 30, 'partial updates preserve unrelated facts');
  // The main-story API produces narration + state in one request.
  context.Chat = { messages: [{ role: 'user', content: '繼續修煉' }] };
  context.API.send = async (_api, messages) => {
    requests.push({ messages });
    assert.match(JSON.stringify(messages), /三界九域原生修煉狀態/);
    return { text: '你成功突破到煉虛期。\n<BAO_STATE>' + JSON.stringify({ modules: { [Core.id]: { realm: '煉虛期', breakthrough_result: '成功', evidence: '成功突破到煉虛期' } } }) + '</BAO_STATE>' };
  };
  load('same-model-state-merge');
  const count = requests.length;
  const result = await context.API.send(config.api, [{ role: 'user', content: '繼續修煉' }]);
  assert.equal(result.text, '你成功突破到煉虛期。');
  await WorldStateEngine.update(config, '繼續修煉', result.text);
  assert.equal(requests.length, count + 1, 'merged mode never needs a second API request');
  assert.equal(GameState.current.modules[Core.id].realm, '煉虛期');
  Modules.applyCustomization({ enabledBuiltIns: [] });
  assert.equal(Modules.compactForPrompt(), '');
  assert.equal(GameState.current.modules[Core.id].realm, '煉虛期', 'disabling preserves saved progression');
  const disabled = Helper.stateUpdate({ modules: { [Core.id]: { realm: '天帝' } } }, GameState.current.moduleDefinitions, '天帝');
  GameState.applyUpdate(disabled);
  assert.equal(GameState.current.modules[Core.id].realm, '煉虛期');
  GameState.create({ name: '另一個故事' }, config);
  assert.equal(GameState.current.modules[Core.id], undefined, 'story state cannot leak into another story');
  console.log('Three Realms cultivation runtime: opt-in, both state routes, snapshot restore, preservation and isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

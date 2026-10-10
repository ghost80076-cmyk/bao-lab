'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { console, structuredClone, setTimeout() {} };
context.window = context;
vm.createContext(context);
const load = name => vm.runInContext(fs.readFileSync('js/' + name + '.js', 'utf8'), context);
for (const name of ['state', 'helper-data', 'world-state', 'three-realms-event-profiles', 'three-realms-events-core', 'world-modules']) load(name);
vm.runInContext('window.GameState = GameState;', context);
const { GameState, BAOWorldModules: modules, BAOThreeRealmsEventsCore: core } = context;
let calls = 0;
context.API = { send() { calls++; } };
context.Chat = { messages: [{ role: 'user', content: '【探索事件】' }] };
let build = async () => [{ role: 'system', content: 'stable' }, ...context.Chat.messages.map(m => ({ ...m }))];
const ids = new Set();
context.App = {
  activeCharacter: { name: '三界世界', world_modules: [] },
  buildMessages: (...args) => build(...args),
  wrapBuildMessages(id, wrapper) {
    if (ids.has(id)) return false;
    ids.add(id);
    const next = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper.call(this, next, ...args);
    return true;
  }
};
GameState.create(context.App.activeCharacter, {});
load('three-realms-events');
load('three-realms-events');
assert.equal(ids.size, 1, 'duplicate script installation cannot stack wrappers');
(async () => {
  assert.equal(context.BAOThreeRealmsEvents.commands().length, 0);
  assert.equal((await context.App.buildMessages()).length, 2);
  modules.applyCustomization({ enabledBuiltIns: [core.id] });
  assert.equal(context.BAOThreeRealmsEvents.commands().length, 11);
  assert.equal(modules.definitions(context.App.activeCharacter).find(d => d.id === core.id).tracking, 'manual');
  const original = JSON.stringify(GameState.current);
  const output = await context.App.buildMessages();
  assert.equal(output.length, 3);
  assert.match(output[1].content, /探索事件/);
  assert.match(output[1].content, /所在界域未確認/);
  assert.equal(output[0].content, 'stable');
  assert.equal(JSON.stringify(GameState.current), original, 'prompt building must not advance time or grant resources');
  GameState.current = JSON.parse(original);
  modules.ensureState(context.App.activeCharacter);
  assert.equal(context.BAOThreeRealmsEvents.commands().length, 11, 'story snapshot retains opt-in');
  context.Chat.messages = [{ role: 'assistant', content: '危機事件' }, { role: 'user', content: '繼續' }];
  assert.equal((await context.App.buildMessages()).length, 3, 'previous event words cannot retrigger an event');
  modules.applyCustomization({ enabledBuiltIns: [] });
  context.Chat.messages = [{ role: 'user', content: '機運事件' }];
  assert.equal((await context.App.buildMessages()).length, 2);
  assert.equal(context.BAOThreeRealmsEvents.commands().length, 0);
  modules.applyCustomization({ enabledBuiltIns: [core.id] });
  let release;
  build = () => new Promise(resolve => { release = resolve; });
  const pending = context.App.buildMessages();
  GameState.create({ name: '另一份故事', world_modules: [] }, {});
  release([{ role: 'user', content: '機運事件' }]);
  assert.equal((await pending).length, 1, 'switching stories during an async prompt build cannot inject old settings');
  assert.equal(context.BAOThreeRealmsEvents.commands().length, 0);
  assert.equal(calls, 0, 'native guidance never creates an additional model request');
  console.log('Three Realms events runtime: native opt-in, snapshot restore, disable, duplicate load, transient turn isolation, story switching and zero extra requests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-helper-reconnect.js'), 'utf8');

const api = (baseUrl, protocol = 'openai', key = '') => ({ model: 'model', baseUrl, protocol, key });
const previous = {
  main: api('https://main.example/v1/', 'openai', 'MAIN_SESSION_ONLY'),
  state: api('https://state.example/v1/', 'openai', 'STATE_SESSION_ONLY'),
  memory: api('https://memory.example/v1/', 'gemini', 'MEMORY_SESSION_ONLY')
};
const state = { current: {} };
let config = { api: api('https://main.example/v1'), cost: { stateApi: api('https://state.example/v1') },
  memory: { summaryApi: api('https://other.example/v1', 'gemini') } };
const app = { config, activeCharacter: { id: 'character' } };
const tasks = [];
let opens = 0;
const document = { getElementById: () => null };
const storage = { restoreStory: save => { app.config = structuredClone(save.config); state.current.config = app.config; return true; } };
const window = { App: app, Storage: storage, BAOChatAPISettings: { open: () => { opens++; return true; } } };
const context = vm.createContext({ window, document, App: app, Storage: storage, GameState: state,
  console, queueMicrotask: callback => tasks.push(callback), setTimeout: () => {} });
vm.runInContext(source, context, { filename: 'story-helper-reconnect.js' });
const helper = window.BAOStoryHelperReconnect;
assert(helper, 'helper reconnect module installed');

helper.reconcile(previous, config);
assert.equal(config.cost.stateApi.key, 'STATE_SESSION_ONLY');
assert.equal(config.memory.summaryApi.key, '');
assert.equal(helper.missing(config), true);
console.log('PASS same auxiliary connection reuses session key; different endpoint does not');

config = { api: api('https://main.example/v1'), cost: { stateApi: api('https://main.example/v1', 'openai', 'FAKE_SAVED_KEY') },
  memory: { summaryApi: api('https://memory.example/v1', 'anthropic', 'FAKE_SAVED_MEMORY_KEY') } };
helper.reconcile(previous, config);
assert.equal(config.cost.stateApi.key, 'MAIN_SESSION_ONLY');
assert.equal(config.memory.summaryApi.key, '');
assert.equal(helper.missing(config), true);
console.log('PASS same main connection can share session key, protocol changes cannot');

const saved = { config: { api: api('https://main.example/v1'),
  cost: { stateApi: api('https://state.example/v1', 'openai', 'KEY_IN_SAVED_STORY') },
  memory: { summaryApi: api('https://new-memory.example/v1', 'gemini', 'ALSO_IN_SAVED_STORY') } } };
app.config = { api: previous.main, cost: { stateApi: previous.state }, memory: { summaryApi: previous.memory } };
assert.equal(storage.restoreStory(saved), true);
assert.equal(app.config.cost.stateApi.key, 'STATE_SESSION_ONLY');
assert.equal(app.config.memory.summaryApi.key, '');
assert.equal(app.config.api.key, '');
assert.equal(state.current.config, app.config);
while (tasks.length) tasks.shift()();
assert.equal(opens, 1);
console.log('PASS restored story drops keys from saved payload and prompts for missing auxiliary key');

app.config = { api: api('https://main.example/v1', 'openai', 'CURRENT_MAIN'),
  cost: { stateApi: api('https://main.example/v1', 'openai', '') }, memory: {} };
assert.equal(helper.missing(app.config), false);
console.log('PASS same-endpoint helper works with a single main key');

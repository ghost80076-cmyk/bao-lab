const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];
let trackedFields = false;
const context = vm.createContext({
  console,
  window: null,
  GameState: {
    current: null,
    create(_character, config) {
      this.current = { config, time: '早上', location: '客廳', npcs: [], events: [] };
      return this.current;
    },
    applyUpdate(patch) { Object.assign(this.current, patch); }
  },
  API: {
    async send(_config, messages) {
      calls.push(messages);
      return { text: JSON.stringify({ time: '夜晚', npcs: [{ name: '阿青', presence: 'away' }] }) };
    }
  },
  BAOHelperData: { stateUpdate(data) { return data; } },
  BAOCharacterStatus: { hasTrackedFields() { return trackedFields; } }
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/world-state.js'), 'utf8'), context);
const engine = vm.runInContext('WorldStateEngine', context);
const { GameState } = context;

(async () => {
  const text = { narrativeMode: 'immersive', displayMode: 'text', api: { key: 'mock' } };
  GameState.create({}, text);
  assert.equal(text.stateTracking, false, 'new text stories record their original API cost preference');
  assert.equal(engine.enabled(text), false);
  text.displayMode = 'ui';
  assert.equal(engine.enabled(text), false, 'changing the view must not start a state API');
  assert.equal(await engine.update(text, '早安', '她點頭'), null);
  assert.equal(calls.length, 0, 'text-to-UI switch must not silently incur API cost');

  const ui = { narrativeMode: 'immersive', displayMode: 'ui', api: { key: 'mock' } };
  GameState.create({}, ui);
  assert.equal(ui.stateTracking, true);
  ui.displayMode = 'text';
  assert.equal(engine.enabled(ui), true, 'UI-to-text switch must preserve state tracking');
  await engine.update(ui, '晚安', '阿青離開');
  assert.equal(calls.length, 1);
  assert.equal(GameState.current.npcs[0].presence, 'away', 'tracking updates shared saved state');
  const restored = JSON.parse(JSON.stringify(ui));
  assert.equal(restored.stateTracking, true, 'the per-story preference survives JSON backup');
  restored.displayMode = 'ui';
  assert.equal(engine.enabled(restored), true);

  const legacy = { narrativeMode: 'immersive', displayMode: 'ui' };
  assert.equal(engine.enabled(legacy), true);
  assert.equal(legacy.stateTracking, true, 'old saves inherit their previous behavior once');
  legacy.displayMode = 'text';
  assert.equal(engine.enabled(legacy), true);

  const world = { narrativeMode: 'world', displayMode: 'text', stateTracking: false };
  assert.equal(engine.enabled(world), true, 'world simulation stays tracked');
  trackedFields = true;
  assert.equal(engine.enabled({ narrativeMode: 'immersive', displayMode: 'text', stateTracking: false }), true,
    'explicit character fields stay tracked');
  trackedFields = false;
  assert.equal(engine.enabled({ narrativeMode: 'immersive', displayMode: 'ui', stateTracking: false }), false,
    'an explicit saved preference beats the visual mode');
  console.log('Display/state tracking regression: PASS (new, legacy, save/restore, both switches, API isolation)');
})().catch(error => { console.error(error); process.exitCode = 1; });

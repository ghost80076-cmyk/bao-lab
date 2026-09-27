const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MemoryLocalStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

global.window = global;
global.localStorage = new MemoryLocalStorage();
global.App = {
  escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, x => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[x]));
  }
};
global.document = {
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() {
    return {
      id: '',
      style: {},
      dataset: {},
      innerHTML: '',
      appendChild() {},
      addEventListener() {},
      querySelector() { return null; },
      remove() {}
    };
  },
  body: { appendChild() {} }
};
global.setInterval = () => 1;
global.clearInterval = () => {};
global.alert = () => {};

const root = path.join(__dirname, '..');
const run = file => vm.runInThisContext(
  fs.readFileSync(path.join(root, file), 'utf8'),
  { filename: file }
);

run('js/character.js');
vm.runInThisContext('window.CharacterEngine = CharacterEngine;');
run('js/character-readiness.js');
run('js/bao-doctor.js');

assert.ok(global.BAODoctor, 'BAO Doctor should initialize');
assert.equal(global.BAODoctor.version, 1);

const basic = JSON.parse(fs.readFileSync(
  path.join(root, 'data', 'characters', 'character-basic-template.json'),
  'utf8'
));

const baseline = BAODoctor.analyze(basic);
assert.equal(baseline.scope, 'static-card');
assert.ok(Array.isArray(baseline.layers));
assert.equal(baseline.layers.length, 6);
assert.equal(
  baseline.layers.find(layer => layer.id === 'runtime')?.status,
  'not-tested',
  'v1 must not pretend runtime evidence exists'
);
assert.match(baseline.runtimeBoundary, /尚未讀取實際故事/);
assert.equal(
  baseline.findings.some(item => item.severity === 'blocker'),
  false,
  'valid template should not receive a structural blocker'
);

const broken = structuredClone(basic);
broken.content.system_prompt = '';
broken.content.greeting = '';
const brokenReport = BAODoctor.analyze(broken);
assert.equal(
  brokenReport.layers.find(layer => layer.id === 'structure')?.status,
  'blocked'
);
assert.ok(
  brokenReport.findings.some(item => item.layer === 'structure' && item.severity === 'blocker')
);
assert.match(brokenReport.nextStep, /先修阻擋性結構問題/);

const world = structuredClone(basic);
world.gameplay = world.gameplay || {};
world.gameplay.supported_modes = { immersive: true, world: true };
world.gameplay.initial_state = { ...(world.gameplay.initial_state || {}), time: '', location: '' };
world.content.world = '';
world.content.world_focus = [];
world.content.npc_rules = '';
const worldReport = BAODoctor.analyze(world);
assert.ok(
  worldReport.findings.some(item => item.layer === 'world' && item.severity === 'warning'),
  'world mode without world rules/focus should be surfaced'
);
assert.ok(
  worldReport.findings.some(item => item.layer === 'longplay' && item.severity === 'warning'),
  'missing world start state should be attributed to longplay'
);

const html = BAODoctor.reportHTML(baseline, '<img src=x onerror=alert(1)>');
assert.doesNotMatch(html, /<img src=x/);
assert.match(html, /&lt;img/);
assert.match(html, /Runtime/);

console.log('PASS BAO Doctor v1 static diagnostic layering and runtime boundary');

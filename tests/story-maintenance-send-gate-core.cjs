const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const js = filename => fs.readFileSync(path.join(__dirname, '..', 'js', filename), 'utf8');
const classes = value => ({
  values: new Set(value), toggle(key, enabled) { enabled ? this.values.add(key) : this.values.delete(key); },
  contains(key) { return this.values.has(key); }
});
const nodes = {};
const input = { value: '玩家尚未送出的文字', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
const send = { disabled: false, dataset: {}, setAttribute() {}, before(node) { composer.cancel = node; } };
const composer = {
  cancel: null,
  classList: classes([]),
  before(node) { nodes[node.id] = node; },
  querySelector(key) { return key === 'button.primary' ? send : key === '[data-cancel-generation]' ? this.cancel : null; }
};
const document = {
  querySelector(key) { return key === '#chat-view .composer' ? composer : key === '[data-cancel-generation]' ? composer.cancel : null; },
  getElementById(key) { return key === 'user-input' ? input : nodes[key] || null; },
  createElement() { return { classList: classes(['hidden']), dataset: {}, setAttribute() {}, addEventListener() {}, hidden: false, textContent: '' }; }
};
const owner = {};
let calls = 0;
const sandbox = {console, document, AbortController, API: {}, GameState: { current: owner }, App: {
  config: { demoMode: false, api: { key: 'TEST-KEY' } },
  wrapSendMessage(_id, fn) { const next = this.sendMessage.bind(this); this.sendMessage = (...args) => fn.call(this, next, ...args); },
  async sendMessage() { calls++; return { ok: true }; }
}};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(js('story-maintenance-lock.js'), sandbox);
vm.runInContext(js('request-lifecycle.js'), sandbox);
const lock = sandbox.BAOStoryMaintenanceLock;
(async () => {
  assert.equal(lock.start(owner, { label: '整理第 13～16 輪' }), true);
  assert.equal(send.disabled, true, 'maintenance must disable send');
  assert.match(nodes['bao-story-maintenance-notice'].textContent, /整理第 13～16 輪/);
  await sandbox.App.sendMessage();
  assert.equal(calls, 0, 'no provider call while maintenance owns the story');
  assert.equal(input.value, '玩家尚未送出的文字', 'unsent draft cannot be erased');
  assert.equal(lock.end(owner), true);
  assert.equal(send.disabled, false);
  assert.equal(nodes['bao-story-maintenance-notice'].hidden, true);
  const result = await sandbox.App.sendMessage();
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(input.value, '玩家尚未送出的文字');
  console.log('maintenance send gate and draft preservation tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

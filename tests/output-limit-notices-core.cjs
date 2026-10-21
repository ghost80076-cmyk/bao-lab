const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');

// The builder must match the actual hosted Worker ceiling, not the BYOK UI ceiling.
{
  const values = {
    'api-type': { value: 'gemini' },
    'max-output-tokens': { value: '12032', max: '32768', dataset: {} },
    'max-output-limit-hint': { textContent: '' }
  };
  const context = {
    document: { readyState: 'loading', getElementById: id => values[id] || null },
    App: { getSelectedPreset: () => null },
    addEventListener() {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('cost-control.js'), context);
  const cost = context.BAOCostControl;
  assert.equal(cost.outputCapFor({ type: 'bao-credits' }), 8192);
  assert.equal(cost.outputCapFor({ route: 'bao-credits' }), 8192);
  assert.equal(cost.outputCapFor({ type: 'openrouter' }), 32768);
  values['api-type'].value = 'bao-credits';
  cost.syncOutputLimit();
  assert.equal(values['max-output-tokens'].max, '8192');
  assert.equal(values['max-output-tokens'].value, '8192');
  assert.match(values['max-output-limit-hint'].textContent, /8,192/);
  values['api-type'].value = 'openrouter';
  cost.syncOutputLimit();
  assert.equal(values['max-output-tokens'].max, '32768');
  assert.equal(values['max-output-tokens'].value, '12032', 'switching back restores the earlier BYOK preference');
}

// Output warnings belong to the external request notice, never to story text.
{
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.textContent = '';
      this.dataset = {};
      this.hidden = false;
      this.children = [];
      this.attrs = {};
      this.classList = { contains: () => false };
    }
    setAttribute(key, value) { this.attrs[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    before(node) { this.insertedBefore = node; }
  }
  const owner = {};
  const composer = new Element('composer');
  const stream = new Element('stream');
  const chat = { querySelector: selector => selector === '.composer' ? composer : null };
  const observers = [];
  const context = {
    document: {
      getElementById: id => id === 'chat-view' ? chat : id === 'chat-stream' ? stream : null,
      createElement: name => new Element(name),
      head: { append() {} }
    },
    App: { __requestPending: false, config: { api: { type: 'bao-credits' } } },
    Chat: {},
    GameState: { current: owner },
    BAOCreditsPilot: { isAccountConnection: api => api?.type === 'bao-credits' },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('chat-system-notices.js'), context);
  const notices = context.BAOChatSystemNotices;
  const warning = notices.region.children[2];
  notices.reportCompletion({ finishReason: 'stop' }, owner);
  assert.equal(notices.region.hidden, true, 'normal stop should not display warnings');
  notices.reportCompletion({ finishReason: 'MAX_TOKENS' }, owner);
  assert.equal(notices.region.hidden, false);
  assert.equal(notices.region.dataset.state, 'truncated');
  assert.match(warning.textContent, /狀態欄可能不完整/);
  assert.match(warning.textContent, /8,192/);
  assert.equal(stream.children.length, 0, 'warning must not be inserted into story');
  notices.clearCompletion();
  assert.equal(notices.region.hidden, true, 'next turn clears the old warning');
  context.App.config.api = { type: 'openrouter' };
  notices.reportCompletion({ finishReason: 'length' }, owner);
  assert.equal(notices.region.hidden, false);
  assert.match(warning.textContent, /服務商規格/);
  context.GameState.current = {};
  const chatObserver = observers.find(observer => observer.target === chat);
  assert.ok(chatObserver, 'notices must watch story-view changes');
  chatObserver.callback();
  assert.equal(notices.region.hidden, true, 'an old story cannot carry its warning into a new one');
  notices.reportCompletion({ finishReason: 'max_tokens' }, owner);
  assert.equal(notices.region.hidden, true, 'a stale request cannot raise notices in another story');
}
const app = read('app.js');
assert.match(app, /BAOChatSystemNotices\?\.reportCompletion\?\.\(result, owner\)/);
assert.match(app, /BAOChatSystemNotices\?\.clearCompletion\?\.\(\)/);
console.log('Hosted cap and truncation notices passed');

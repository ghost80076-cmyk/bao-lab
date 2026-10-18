'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/streaming-ui.js'), 'utf8');
(async () => {
  for (const change of ['story', 'bubble', 'settled']) {
    let callbacks, finish, currentBubble;
    const frames = [], events = [];
    const oldBubble = { innerHTML: '', closest: () => ({ classList: { add() {} } }) };
    currentBubble = oldBubble;
    const stream = { scrollTop: 7 };
    const ctx = vm.createContext({
      document: {
        getElementById: id => id === 'chat-view' ? { classList: { contains: () => true } } : id === 'chat-stream' ? stream : null,
        querySelector: () => currentBubble
      },
      GameState: { current: {} }, App: { formatMessage: text => text },
      MutationObserver: class { observe() {} },
      API: { send(config) { callbacks = config; return new Promise(resolve => { finish = resolve; }); } },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
      dispatchEvent: event => events.push(event),
      requestAnimationFrame: frame => frames.push(frame)
    });
    ctx.window = ctx;
    vm.runInContext(source, ctx);
    const pending = ctx.API.send({}, []);
    callbacks.onDelta('one', 'one');
    frames.shift()();
    assert.equal(oldBubble.innerHTML, 'one', 'current request paints normally');
    callbacks.onDelta('two', 'onetwo');
    if (change === 'story') ctx.GameState.current = {};
    if (change === 'bubble') currentBubble = { innerHTML: 'new bubble' };
    if (change === 'settled') { finish({ text: 'final' }); await pending; }
    frames.shift()();
    const before = events.length;
    callbacks.onDelta('late', 'stale text');
    assert.equal(events.length, before, 'stale deltas cannot dispatch current-story events');
    assert.equal(oldBubble.innerHTML, 'one', 'queued frame cannot repaint after invalidation');
    if (change === 'bubble') assert.equal(currentBubble.innerHTML, 'new bubble');
    if (change !== 'settled') { finish({ text: 'final' }); await pending; }
  }
  console.log('streaming turn ownership core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

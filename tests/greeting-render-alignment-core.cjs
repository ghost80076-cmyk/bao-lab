'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function run(file, stored, transient) {
  const frames = [];
  const node = text => {
    const bubble = { innerHTML: text, dataset: {}, style: {}, classList: { toggle() {}, remove() {} }, querySelector: () => null };
    return { dataset: {}, classList: { contains: name => name === 'assistant', remove() {} }, querySelector: () => bubble, bubble };
  };
  const greeting = node('original greeting');
  greeting.dataset.storyGreeting = 'true';
  greeting.bubble.dataset.authoredGreeting = 'true';
  const extra = node(transient ? 'cancelled request feedback' : 'old reply');
  const nodes = stored && !transient ? [greeting] : [greeting, extra];
  const messages = stored ? [{ role: 'assistant', content: 'greeting', greeting: true }]
    : [{ role: 'assistant', content: 'reply' }];
  const before = JSON.stringify(messages);
  const stream = { querySelectorAll: () => nodes };
  const ctx = vm.createContext({
    App: { activeCharacter: { greeting: 'greeting' }, config: {}, formatMessage: s => s, sendMessage: async () => {}, renderChatShell() {} },
    Chat: { messages }, API: { send: async () => ({text:'unused'}) }, GameState: { current: {} },
    BAOSceneHTML: { render: s => 'rendered:' + s, prefs: { mode: 'native' } },
    document: { getElementById: id => id === 'chat-stream' ? stream : null, querySelector: () => null },
    MutationObserver: class { observe() {} }, queueMicrotask: fn => frames.push(fn),
    requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => frames.push(fn)
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), ctx);
  ctx.App.renderChatShell();
  while (frames.length) frames.shift()();
  if (transient) assert.equal(extra.bubble.innerHTML, 'cancelled request feedback', file + ' must not repaint a transient node as the stored greeting');
  else if (stored) assert.equal(greeting.bubble.innerHTML, 'rendered:greeting', file + ' still paints stored greetings');
  else assert.equal(extra.bubble.innerHTML, 'rendered:reply', file + ' still supports a legacy standalone greeting');
  assert.equal(JSON.stringify(messages), before, 'Rendering must not alter history');
}
for (const file of ['streaming-ui.js', 'scene-render-integrity.js']) {
  run(file, true, true);
  run(file, true, false);
  run(file, false, false);
}
console.log('PASS stored greetings never consume transient feedback; committed and legacy greetings still render without mutating history');

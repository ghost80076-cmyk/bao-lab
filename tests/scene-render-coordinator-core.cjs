const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/scene-render-coordinator.js'), 'utf8');

function bubble(html = '') {
  return {
    innerHTML: html,
    classList: { toggle() {} },
    querySelector(selector) { return selector === '.story-inline-editor' ? this.editor || null : null; }
  };
}
function message(role, content = '') {
  const body = bubble(role === 'assistant' ? content : 'user-message');
  return { role, body, classList: { contains(value) { return value === role; } }, querySelector(selector) { return selector === '.bubble' ? body : null; } };
}
const nodes = [message('assistant', 'opening')];
const root = { nodeType: 1, querySelectorAll() { return nodes; } };
const chat = { messages: [] };
const observations = [];
const renderer = {
  prefs: { mode: 'efficient' },
  render(text) {
    if (this.prefs.mode === 'native') return `PLAIN:${text.replace(/\[\/?(?:NARRATION|SCENE:[^\]]+)\]/g, '')}`;
    const result = text.match(/\[SCENE:realistic\]\s*\[NARRATION\]([\s\S]*?)\[\/NARRATION\]/i);
    return result ? `<section class="scene">${result[1].trim()}</section>` : `NORMAL:${text}`;
  }
};
const app = { activeCharacter: { greeting: 'opening' }, renderChatShell() {} };
const context = {
  window: { App: app, Chat: chat, BAOSceneHTML: renderer }, App: app, Chat: chat,
  document: { getElementById() { return root; }, addEventListener() {} },
  MutationObserver: class { constructor(callback) { observations.push(callback); } observe() {} },
  queueMicrotask(callback) { callback(); }, console
};
vm.runInNewContext(source, context);
const coordinator = context.window.BAOSceneRenderCoordinator;
assert.ok(coordinator, 'coordinator mounts');
const raw = '[SCENE:realistic]\n[NARRATION]\n窗外下雨\n[/NARRATION]';
chat.messages = [{ role: 'user', content: '開始' }, { role: 'assistant', content: raw }];
nodes.splice(0, nodes.length, message('user'), message('assistant', raw));
coordinator.reconcile();
assert.match(nodes[1].body.innerHTML, /<section class="scene">窗外下雨<\/section>/);
assert.equal(chat.messages[1].content, raw, 'raw history preserved');
assert.equal(nodes[0].body.innerHTML, 'user-message', 'user bubble untouched');
nodes[1].body.innerHTML = raw; // simulate story-reader rewriting after render
coordinator.reconcile();
assert.match(nodes[1].body.innerHTML, /<section class="scene">/, 'repairs late plain-text overwrite');
chat.messages[1].content = '[SCENE:realistic]\n[NARRATION]\n缺少結尾';
coordinator.reconcile();
assert.match(nodes[1].body.innerHTML, /<section class="scene">缺少結尾<\/section>/, 'repairs missing close only for display');
assert.equal(chat.messages[1].content.endsWith('[/NARRATION]'), false);
renderer.prefs.mode = 'native';
coordinator.reconcile();
assert.match(nodes[1].body.innerHTML, /^PLAIN:/, 'respects native text preference');
renderer.prefs.mode = 'efficient';
nodes[1].body.editor = {};
const beforeEdit = nodes[1].body.innerHTML;
coordinator.reconcile();
assert.equal(nodes[1].body.innerHTML, beforeEdit, 'does not erase inline editor');
delete nodes[1].body.editor;
// Pending assistant exists but has not been committed to Chat.messages.
nodes.push(message('assistant', 'streaming delta'));
coordinator.reconcile();
assert.equal(nodes[2].body.innerHTML, 'streaming delta', 'leaves incomplete streaming alone');
nodes.pop();
coordinator.reconcile();
assert.match(nodes[1].body.innerHTML, /<section class="scene">/, 'committed answer is rendered');
console.log('scene coordinator: 11 assertions passed');

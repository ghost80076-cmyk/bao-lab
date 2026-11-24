const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = path => fs.readFileSync(path, 'utf8');
const app = { activeCharacter: { name: '測試角色', system_prompt: '故事設定', author_status_html: '<div>AUTHOR_TEMPLATE_SENTINEL {{time}}</div>' }, config: { persona: { name: '玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' }, narrativeMode: 'immersive', displayMode: 'text' }, prompts: { immersive: { prompt: '敘事規則' } }, formatMessage: text => String(text), escapeHTML: text => String(text), buildSystemPrompt() { return [this.activeCharacter.system_prompt, this.prompts.immersive.prompt].join('\n'); }, renderChatShell() {} };
Object.assign(app, { loadCharacters() {}, openBuilder() {}, collectConfig() { return this.config; } });
const chat = { messages: [], async context() { return [{ role: 'user', content: '繼續故事' }]; } };
const scripts = [];
const document = {
  querySelector(selector) { return selector === '#chat-view aside' ? null : null; },
  getElementById() { return null; },
  head: { appendChild(node) { scripts.push(node.src); } },
  createElement() { return { src: '', onerror: null }; }
};
const window = { App: app, Chat: chat, GameState: { current: null }, BAOChatMarkup: { sanitize: text => text }, addEventListener() {} };
const CharacterEngine = { composeSystemPrompt: (character, options) => [character.system_prompt, options.modePrompt].join('\n') };
const context = vm.createContext({ window, document, App: app, Chat: chat, GameState: window.GameState, CharacterEngine, localStorage: { getItem() { return null; }, setItem() {} }, MutationObserver: class {}, queueMicrotask });
// Reproduce a cached scene script completing immediately when chat-markup
// injects it. Follow the actual entrypoint order: a later character-ui base
// assignment must never discard the already-installed scene prompt wrapper.
const entryScripts = [...read('index.html').matchAll(/<script\b[^>]*\bsrc="([^"?]+)(?:\?[^"]*)?"/g)].map(match => match[1]);
assert.ok(entryScripts.includes('js/character-ui.js'));
assert.ok(entryScripts.includes('js/chat-markup.js'));
for (const path of entryScripts) {
  if (path === 'js/character-ui.js') vm.runInContext(read(path), context);
  if (path === 'js/chat-markup.js') vm.runInContext(read('js/scene-html-modes.js'), context);
}
assert.ok(window.BAOSceneHTML, 'scene module must initialize');
for (const mode of ['native', 'efficient', 'free']) {
  window.BAOSceneHTML.prefs.mode = mode;
  const request = JSON.stringify([{ role: 'system', content: app.buildSystemPrompt() }, ...awaitContext()]);
  assert.equal((request.match(/【玩家排版偏好】/g) || []).length, 1, `${mode}: scene output contract survives base prompt initialization`);
  assert.ok(!request.includes('AUTHOR_TEMPLATE_SENTINEL'), `${mode}: author HTML leaked into main request`);
}
function awaitContext() { return [{ role: 'user', content: '繼續故事' }]; }
assert.match(read('js/global-bridge.js'), /window\.App\s*=\s*App/);
assert.match(read('js/chat-markup.js'), /script\.src\s*=\s*['"]js\/scene-html-modes\.js(?:\?v=\d+)?['"]/);
console.log('PASS: scene module initializes, loader and global bridge are present, and author template is absent from three main-prompt modes.');
console.log('LIMITATION: historical assistant HTML and actual provider request payloads are not covered by this test.');

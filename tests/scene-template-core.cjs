const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'scene-html-modes.js'), 'utf8');
const escapeHTML = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[x]));
const app = {
  activeCharacter: null,
  escapeHTML,
  formatMessage: text => escapeHTML(text).replace(/\n/g, '<br>'),
  buildSystemPrompt: () => 'BASE PROMPT',
  renderChatShell: () => undefined
};
const chat = { messages: [] };
const window = { App: app, Chat: chat, BAOChatMarkup: { sanitize: escapeHTML } };
const document = {
  querySelector: () => null,
  getElementById: () => null
};
class DOMParser {
  parseFromString(value) {
    const safeText = String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '');
    return { body: { textContent: safeText }, querySelectorAll: () => [] };
  }
}
const context = { window, App: app, Chat: chat, document, DOMParser, localStorage: { getItem: () => null, setItem: () => {} }, queueMicrotask, console };
vm.runInNewContext(source, context, { filename: 'scene-html-modes.js' });
const scene = window.BAOSceneHTML;
assert.ok(scene, 'Scene system should initialize');

const keys = ['forum', 'realistic', 'dramatic', 'communication', 'action', 'investigation', 'fantasy'];
assert.deepEqual(Object.keys(scene.sceneTemplates).sort(), [...keys].sort());
for (const key of keys) {
  const html = scene.render(`[SCENE:${key}]\n[NARRATION]場景文字 <img src=x onerror=alert(1)>[/NARRATION]`);
  assert.ok(html.includes(`bao-scene-${key}`), `${key} should render the selected template`);
  assert.ok(html.includes('場景文字'), `${key} should preserve narration`);
  assert.ok(html.includes('&lt;img'), `${key} should escape model output`);
  assert.ok(!html.includes('<img'), `${key} should not execute model HTML`);
  assert.ok(!html.includes('onerror=alert(1)>'), `${key} should not create executable attributes`);
}
const chatHTML = scene.render('[SCENE:communication][NARRATION]小明：你好\n小美：收到[/NARRATION]');
assert.ok(chatHTML.includes('bao-scene-chat-line'), 'Communication uses message lines');
assert.ok(chatHTML.includes('小明') && chatHTML.includes('小美'));
const investigation = scene.render('[SCENE:investigation][NARRATION]訪談紀錄\n線索：車票[/NARRATION]');
assert.ok(investigation.includes('調查紀錄') && investigation.includes('車票'));
const malformed = scene.render('[SCENE:invalid][NARRATION]一般文字[/NARRATION]');
assert.ok(malformed.includes('一般文字') && !malformed.includes('bao-scene-card'), 'Unknown scenes fall back to text');
assert.ok(!scene.render('[SCENE:fantasy][NARRATION]文字[/NARRATION][STATUS]秘密[/STATUS]').includes('秘密'), 'Status metadata does not enter the scene');
for (const key of keys) assert.ok(app.buildSystemPrompt().includes(`[SCENE:${key}]`), `Prompt lists ${key}`);
scene.prefs.mode = 'native';
const plain = scene.render('[SCENE:action][NARRATION]純文字[/NARRATION]');
assert.ok(plain.includes('純文字') && !plain.includes('bao-scene-card'), 'Native mode remains plain text');
assert.ok(app.buildSystemPrompt().includes('只輸出純文字'), 'Native mode changes model instruction');

// A scene-tagged response can contain multiple narration blocks, character
// dialogue between them and a plain-text author appendix. None may be lost.
const fullReply = '[SCENE:realistic]\n[NARRATION]第一幕：燈光。[/NARRATION]\n林慕晴：「請聽我說。」\n[NARRATION]第二幕：雨聲。[/NARRATION]\n林慕晴：「接著呢？」\n[NARRATION]第三幕：門開了。[/NARRATION]\n---\n**當前世界狀態**：總裁辦公室';
scene.prefs.mode = 'efficient';
const fullScene = scene.render(fullReply);
for (const passage of ['第一幕：燈光。', '林慕晴：「請聽我說。」', '第二幕：雨聲。', '林慕晴：「接著呢？」', '第三幕：門開了。', '當前世界狀態', '總裁辦公室']) {
  assert.ok(fullScene.includes(passage), `Efficient scene must retain ${passage}`);
}
assert.equal((fullScene.match(/第一幕/g) || []).length, 1, 'Scene must not duplicate text');
assert.ok(!fullScene.includes('[NARRATION]') && !fullScene.includes('[SCENE:'), 'Presentation strips structural tags');
scene.prefs.mode = 'native';
for (const passage of ['第一幕：燈光。', '第二幕：雨聲。', '第三幕：門開了。', '總裁辦公室']) {
  assert.ok(scene.render(fullReply).includes(passage), `Native view must retain ${passage}`);
}
console.log(`PASS: ${keys.length} scene templates, escaping, fallback, status isolation, full multi-block story and native mode`);

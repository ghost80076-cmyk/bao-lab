const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/author-regex-core.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'author-regex-text-mod.js'), 'utf8');

test('plain author Regex MOD stays in display-only layer', () => {
  assert.match(source, /AI 回覆顯示層（固定）/);
  assert.match(source, /不改原始故事、記憶、狀態、Prompt 或 API 請求/);
  assert.doesNotMatch(source, /API\.send\s*=/);
  assert.doesNotMatch(source, /buildSystemPrompt\s*=/);
  assert.doesNotMatch(source, /Chat\.messages\s*=/);
});

test('plain Regex MOD uses existing author regex validation', () => {
  const [rule] = Core.normalize([{
    name: '稱呼替換',
    pattern: 'NPC:',
    replacement: '角色：',
    flags: 'g',
    enabled: true
  }]);
  assert.equal(rule.enabled, true);
  assert.equal(rule.rich, false);
  assert.equal(rule.script, false);
  assert.equal(rule.reason, '');
});

test('invalid enabled rules are detectable before save', () => {
  const [rule] = Core.normalize([{
    name: '錯誤規則',
    pattern: '(',
    replacement: 'x',
    flags: 'g',
    enabled: true
  }]);
  assert.match(rule.reason, /正則語法無效/);
});


test('author Regex metadata is normalized and priority controls execution order', () => {
  const rules = Core.normalize([
    { name: '低優先', description: '第二步', pattern: 'B', replacement: 'C', priority: 0, enabled: true },
    { name: '高優先', description: '第一步', pattern: 'A', replacement: 'B', priority: 10, enabled: true }
  ]);
  assert.equal(rules[0].description, '第二步');
  assert.equal(rules[1].priority, 10);
  assert.equal(rules[1].scope, 'assistant_display');
  const rendered = Core.render('A', rules, false);
  assert.equal(rendered.text, 'C');
});

test('author Regex metadata is bounded', () => {
  const [rule] = Core.normalize([{
    name: '邊界',
    description: 'x'.repeat(300),
    pattern: 'a',
    replacement: 'b',
    priority: 999,
    enabled: true
  }]);
  assert.equal(rule.description.length, 240);
  assert.equal(rule.priority, 100);
});

test('editor exposes description, priority and JSON export without touching model data', () => {
  assert.match(source, /說明/);
  assert.match(source, /優先序（-100～100，越大越先）/);
  assert.match(source, /匯出設定/);
  assert.match(source, /yorubay-author-regex-mod/);
  assert.match(source, /不包含 API Key、聊天內容或故事存檔/);
});

test('author plain-text rules run before player-owned replacements', () => {
  const chatSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'regex-chat.js'), 'utf8');
  assert.match(chatSource, /AUTHOR_PREFIX/);
  assert.match(chatSource, /bao:author-regex-changed/);
  const authorIndex = chatSource.indexOf('BAOAuthorRegexCore.render(value, authorRules, false)');
  const legacyPlayerIndex = chatSource.indexOf('R.apply(value, state.rules)');
  const playerIndex = chatSource.indexOf('BAOPlayerTextReplace.applyChat(value, playerState)');
  assert.ok(authorIndex >= 0 && legacyPlayerIndex > authorIndex && playerIndex > legacyPlayerIndex);
});

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

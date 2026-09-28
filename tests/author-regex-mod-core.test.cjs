const assert = require('node:assert/strict');
const test = require('node:test');
const Core = require('../js/author-regex-core.js');

test('author Regex MOD metadata is normalized and bounded', () => {
  const [rule] = Core.normalize([{
    name: '角色稱呼',
    description: '只改 AI 回覆顯示文字',
    pattern: 'NPC:',
    replacement: '角色：',
    flags: 'gi',
    priority: 999,
    scope: 'anything',
    enabled: true
  }]);
  assert.equal(rule.name, '角色稱呼');
  assert.equal(rule.description, '只改 AI 回覆顯示文字');
  assert.equal(rule.priority, 100);
  assert.equal(rule.scope, 'assistant_display');
  assert.equal(rule.enabled, true);
});

test('plain Regex MOD returns display text without mutating source', () => {
  const source = 'NPC: hello';
  const result = Core.render(source, Core.normalize([{
    name: '純文字',
    pattern: 'NPC:',
    replacement: '角色：',
    flags: 'g',
    enabled: true
  }]), false);
  assert.equal(source, 'NPC: hello');
  assert.equal(result.matched, true);
  assert.equal(result.rich, false);
  assert.equal(result.text, '角色： hello');
  assert.match(result.html, /角色： hello/);
});

test('higher priority rules run first while equal priority keeps source order', () => {
  const rules = Core.normalize([
    { name: '低', pattern: 'fox', replacement: 'wolf', flags: 'g', priority: 0 },
    { name: '高', pattern: 'cat', replacement: 'fox', flags: 'g', priority: 20 }
  ]);
  assert.equal(Core.render('cat', rules, false).text, 'wolf');

  const samePriority = Core.normalize([
    { name: '先', pattern: 'cat', replacement: 'fox', flags: 'g', priority: 0 },
    { name: '後', pattern: 'fox', replacement: 'wolf', flags: 'g', priority: 0 }
  ]);
  assert.equal(Core.render('cat', samePriority, false).text, 'wolf');
});

test('rich replacements remain isolated author markup and do not expose raw model html', () => {
  const rules = Core.normalize([{
    name: '卡片',
    pattern: '\\[NAME:([^\\]]+)\\]',
    replacement: '<strong>$1</strong>',
    flags: 'g'
  }]);
  const result = Core.render('[NAME:<img src=x onerror=1>]', rules, false);
  assert.equal(result.matched, true);
  assert.equal(result.rich, true);
  assert.equal(result.text, '');
  assert.match(result.html, /<strong>&lt;img src=x onerror=1&gt;<\/strong>/);
  assert.doesNotMatch(result.html, /<strong><img/);
});

test('invalid enabled rules stay marked instead of executing', () => {
  const [rule] = Core.normalize([{
    name: '壞掉',
    pattern: '(',
    replacement: 'x',
    enabled: true
  }]);
  assert.match(rule.reason, /正則語法無效/);
  const result = Core.render('hello', [rule], false);
  assert.equal(result.matched, false);
  assert.equal(result.text, 'hello');
});

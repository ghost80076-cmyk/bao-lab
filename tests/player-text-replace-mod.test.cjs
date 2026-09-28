const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Mod = require('../js/player-text-replace-mod.js');

test('literal replacement treats regex characters as ordinary text', () => {
  const input = '林沉風(28歲) + [台北]?';
  const state = { active: true, rules: [
    { find: '(28歲)', replace: '(XX歲)', enabled: true },
    { find: '+ [台北]?', replace: '+ [夜灣]?', enabled: true }
  ]};
  assert.equal(Mod.apply(input, state), '林沉風(XX歲) + [夜灣]?');
  assert.equal(input, '林沉風(28歲) + [台北]?');
});

test('multiple replacements run from top to bottom', () => {
  const state = { active: true, rules: [
    { find: '20歲', replace: 'XX歲', enabled: true },
    { find: 'XX歲', replace: '年齡保密', enabled: true }
  ]};
  assert.equal(Mod.apply('角色20歲。', state), '角色年齡保密。');
});

test('disabled rules and inactive MOD preserve original text', () => {
  const rules = [{ find: '大學生', replace: '學生', enabled: false }];
  assert.equal(Mod.apply('她是大學生', { active: true, rules }), '她是大學生');
  assert.equal(Mod.apply('她是大學生', { active: false, rules: [{ ...rules[0], enabled: true }] }), '她是大學生');
});

test('empty find values are ignored and replacement may be empty', () => {
  const state = { active: true, rules: [
    { find: '', replace: 'X', enabled: true },
    { find: '刪除我', replace: '', enabled: true }
  ]};
  assert.equal(Mod.apply('保留 刪除我', state), '保留 ');
});

test('state is bounded and normalized', () => {
  const rules = Array.from({ length: 60 }, (_, i) => ({ find: String(i), replace: 'x', enabled: true }));
  const state = Mod.normalizeState({ active: true, rules });
  assert.equal(state.rules.length, Mod.MAX_RULES);
  assert.equal(state.active, true);
});

test('player MOD implementation stays outside model and chat source mutation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'player-text-replace-mod.js'), 'utf8');
  assert.match(source, /只改你看到的文字/);
  assert.match(source, /GameState/);
  assert.doesNotMatch(source, /API\.send\s*=/);
  assert.doesNotMatch(source, /buildSystemPrompt\s*=/);
  assert.doesNotMatch(source, /Chat\.messages\s*=/);
});

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

test('chat and status scopes are independent', () => {
  const rules = [{ find: '20歲', replace: 'XX歲', enabled: true }];
  const chatOnly = { active: true, scope: { chat: true, status: false }, rules };
  assert.equal(Mod.applyChat('角色20歲。', chatOnly), '角色XX歲。');
  assert.equal(Mod.applyStatus('20歲', chatOnly), '20歲');

  const statusOnly = { active: true, scope: { chat: false, status: true }, rules };
  assert.equal(Mod.applyChat('角色20歲。', statusOnly), '角色20歲。');
  assert.equal(Mod.applyStatus('20歲', statusOnly), 'XX歲');
});

test('legacy player MOD state keeps chat behavior and leaves status opt-in', () => {
  const state = Mod.normalizeState({ active: true, rules: [] });
  assert.deepEqual(state.scope, { chat: true, status: false });
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

test('status renderers replace values without rewriting field labels', () => {
  const characterStatus = fs.readFileSync(path.join(__dirname, '..', 'js', 'character-status-ui.js'), 'utf8');
  const worldModules = fs.readFileSync(path.join(__dirname, '..', 'js', 'world-module-ui.js'), 'utf8');
  const gameplay = fs.readFileSync(path.join(__dirname, '..', 'js', 'gameplay-ui.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  assert.match(characterStatus, /applyStatus/);
  assert.match(worldModules, /applyStatus/);
  assert.match(gameplay, /applyStatus/);
  assert.match(app, /displayStatusValue/);

  assert.doesNotMatch(characterStatus, /displayValue\(displayLabel/);
  assert.doesNotMatch(worldModules, /displayValue\(labelFor/);
  assert.doesNotMatch(gameplay, /displayValue\(item\.label/);
});

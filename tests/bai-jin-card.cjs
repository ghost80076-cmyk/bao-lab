const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/gameplay-ui-core.js');
const Regex = require('../js/author-regex-core.js');
const card = require('../data/characters/community/ba/bai-jin-ash-companion.json');
const sidecar = require('../data/characters/community/ba/bai-jin-ash-companion.regex.json');
const context = vm.createContext({console, structuredClone});
vm.runInContext(fs.readFileSync('js/character.js', 'utf8') + '\nglobalThis.engine = CharacterEngine;', context);
const c = context.engine.normalize(card);
assert.equal(c.world_modules.find(m => m.id === 'private').visibility, 'internal');
const ui = Core.normalize(c.gameplay_ui);
assert.equal(ui.panels.length, 3);
const paths = [];
function collect(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'path' || key.endsWith('_path')) && typeof item === 'string') paths.push(item);
    else collect(item);
  }
}
collect(c.gameplay_ui.panels);
for (const path of paths) {
  assert.ok(!path.startsWith('modules.private'), path);
  assert.notEqual(Core.getPath(c.initial_state, path), undefined, path);
}
assert.doesNotMatch(JSON.stringify(c.opening), /黎雪|E-00|培養槽/);
assert.equal(c.opening.choices.length, 3);
assert.ok(fs.existsSync(card.meta.avatar));
const rules = Regex.normalize(sidecar);
assert.equal(rules.filter(r => r.reason || r.script || !r.enabled).length, 0);
assert.equal(Regex.render(c.greeting, rules, false).matched, false, 'native opening must keep draft choices');
const result = Regex.render('前文\n【YB:BAIJIN:SCENE】灰市【/YB:BAIJIN:SCENE】\n中間\n【YB:BAIJIN:NOTE】向北走【/YB:BAIJIN:NOTE】\n後文', rules, false);
assert.equal(result.applied, 2);
assert.doesNotMatch(result.html, /【\/?YB:BAIJIN:/);
for (const text of ['前文', '中間', '後文', '灰市', '向北走']) assert.match(result.html, new RegExp(text));
const danger = Regex.render('【YB:BAIJIN:NOTE】<img src=x onerror=alert(1)>【/YB:BAIJIN:NOTE】', rules, false);
assert.match(danger.html, /&lt;img/);
assert.doesNotMatch(danger.html, /<img/);
assert.equal(Regex.render('普通敘事，沒有紙條。', rules, false).matched, false);
console.log('PASS Bai Jin: native UI paths, private-state isolation, opening choices and escaped display Regex');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/gameplay-ui-core.js');
const Regex = require('../js/author-regex-core.js');
const card = require('../data/characters/community/5c/qiao-yining-nonexistent-boyfriend.json');
const sidecar = require('../data/characters/community/5c/qiao-yining-nonexistent-boyfriend.regex.json');
const context = vm.createContext({console, structuredClone});
vm.runInContext(fs.readFileSync('js/character.js','utf8')+'\nglobalThis.engine = CharacterEngine;', context);
const c = context.engine.normalize(card);
assert.equal(c.world_modules.find(m => m.id === 'private').visibility, 'internal');
const ui = Core.normalize(c.gameplay_ui);
assert.equal(ui.panels.length, 4);
const paths = [];
const collect = value => {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'path' || key.endsWith('_path')) && typeof item === 'string') paths.push(item);
    else collect(item);
  }
};
collect(c.gameplay_ui.panels);
for (const path of paths) {
  assert.ok(!path.startsWith('modules.private'), path);
  assert.notEqual(Core.getPath(c.initial_state, path), undefined, path);
}
const rules = Regex.normalize(sidecar);
assert.equal(rules.filter(r => r.reason || r.script || !r.enabled).length, 0);
const result = Regex.render(c.greeting, rules, false);
assert.equal(result.applied, 2);
assert.doesNotMatch(result.html, /【\/?YB:QIAO:/);
assert.match(result.html, /門鎖發出一聲輕響/);
assert.match(result.html, /看夠了嗎/);
const dangerous = Regex.render('【YB:QIAO:NOTE】<img src=x onerror=alert(1)>【/YB:QIAO:NOTE】', rules, false);
assert.match(dangerous.html, /&lt;img/);
assert.doesNotMatch(dangerous.html, /<img/);
assert.equal(Regex.render('普通正文，沒有筆記標記。', rules, false).matched, false);
assert.doesNotMatch(c.opening.posts[0].content, /【YB:/);
assert.equal(c.opening.choices.length, 4);
assert.ok(fs.existsSync(card.meta.avatar));
console.log('PASS 喬以寧: native normalization, visible paths, internal state, Regex escaping and opening choices');

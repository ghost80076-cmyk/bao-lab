const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/gameplay-ui-core.js');
const Regex = require('../js/author-regex-core.js');
const card = require('../data/characters/community/95/midnight-paper-bride-mio.json');
const sidecar = require('../data/characters/community/95/midnight-paper-bride-mio.regex.json');
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
assert.equal(Regex.render(c.greeting,rules,false).matched,false);
for (const [tag,label] of [['RECORD','紙行紀錄'],['FRAME','錄影片段']]) {
  const result = Regex.render(`前文【YB:MIO:${tag}】測試原文【/YB:MIO:${tag}】後文`,rules,false);
  assert.equal(result.applied,1);
  assert.match(result.html,new RegExp(label));
  assert.match(result.html,/前文/);assert.match(result.html,/後文/);
  assert.doesNotMatch(result.html,/【YB:/);
  const dangerous = Regex.render(`【YB:MIO:${tag}】<img src=x onerror=alert(1)>【/YB:MIO:${tag}】`,rules,false);
  assert.match(dangerous.html,/&lt;img/);assert.doesNotMatch(dangerous.html,/<img/);
}
assert.equal(Regex.render('普通正文',rules,false).matched,false);
assert.equal(c.opening.choices.length,0);
assert.ok(fs.existsSync(card.meta.avatar));
assert.equal(card.gameplay.initial_state.npcs[0].name,'長髮女人');
assert.equal(card.gameplay.initial_state.modules.relic.wearing,'未知');
assert.equal(c.world_modules.find(m=>m.id==='history').story_history,true);
console.log('PASS Mio native normalization, visible paths, internal state and escaped optional Regex');

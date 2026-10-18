const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const card = require('../data/characters/community/c7/eternal-night-codex.json');
const uiCore = require('../js/gameplay-ui-core.js');
const bookCore = require('../js/worldbook-library-core.js');
const ctx = { console, structuredClone, Date, localStorage: {getItem(){return null;}}, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/character.js','utf8') + '\nthis.engine=CharacterEngine;',ctx);
const normalized = ctx.engine.normalize(card);
assert.equal(normalized.world_modules.length, 10);
assert.equal(normalized.opening.choices.length, 4);
assert.equal(normalized.system_prompt, card.content.system_prompt);
const state = structuredClone(card.gameplay.initial_state);
const ui = uiCore.normalize(card.gameplay.ui_schema);
assert.ok(ui);
for(const panel of ui.panels) for(const section of panel.sections) {
  if(section.path) assert.ok(Array.isArray(uiCore.getPath(state,section.path)));
  for(const item of section.items || []) {
    assert.ok(uiCore.isDisplayPath(item.path), item.path);
    assert.notEqual(uiCore.getPath(state,item.path), undefined, item.path);
  }
}
uiCore.applyBuilderValues(ui, uiCore.builderDefaults(ui), state);
for(const f of ui.builder.fields) assert.notEqual(uiCore.getPath(state,f.target_path),undefined);
assert.equal(state.modules.codex.marks, 0, 'initial interface is not a collected fragment');
assert.equal(state.modules.vitals.gold, 0, 'offered reward is not earned money');
assert.equal(state.modules.inventory.length, 0, 'offered tools and rewards are not accepted inventory');
assert.equal(state.modules.quests[0].status, '已提出，未接受');
assert.equal(state.modules.rewards.length, 0);
const library=state.worldbookLibrary;
const packs=library.installed.map(bookCore.normalizePack);
assert.equal(packs.length,3);
assert.equal(packs.reduce((n,p)=>n+p.entries.length,0),38);
const relics=packs.find(p=>p.meta.id==='eternal-night-relics');
assert.equal(relics.entries.length,12);
assert.equal(new Set(relics.entries.map(e=>e.title)).size,12);
const cast=packs.find(p=>p.meta.id==='eternal-night-cast');
for(const id of ['yuna','luna','lia','aria','cecilia']) {
  assert.match(cast.entries.find(e=>e.id===id).content,/只發展友誼、師徒、家族和冒險合作/);
}
const recalled=bookCore.select(packs,library.enabled,{world:'astral-continent',latestUser:'永夜領 艾絲特'}, {maxChars:2200,maxEntries:4});
assert.ok(recalled.entries.length>0 && recalled.entries.length<=4);
assert.ok(recalled.text.length<=2200);
assert.doesNotMatch(JSON.stringify(card.gameplay.ui_schema),/後花園|祭品|容器|園丁/);
const manifest=require('../data/character-catalog/community/manifest.json');
let count=0;
for(const page of manifest.pages){const list=JSON.parse(fs.readFileSync(page.file));assert.equal(list.length,page.count);count+=list.length;}
assert.equal(count,manifest.total);
console.log('PASS Eternal Night: imports, UI bindings, Builder, 38 lore entries, 12 powers, nonsexual youth branches, no premature rewards');

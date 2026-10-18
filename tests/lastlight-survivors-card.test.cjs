'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const card = require('../data/characters/community/ca/lastlight-survivors.json');
const Core = require('../js/gameplay-ui-core.js');
const Startup = require('../js/story-startup-core.js');
const Regex = require('../js/author-regex-core.js');
const Books = require('../js/worldbook-library-core.js');
const schema = Core.normalize(card.gameplay.ui_schema);
const defaults = Core.builderDefaults(schema);
const groups = schema.builder.choice_groups;
assert.deepEqual(groups.map(g=>g.options.length), [13,23,26]);
assert.equal(Core.validateBuilderValues(schema, defaults).ok, true);
assert.equal(Core.remainingPoints(schema, defaults), 8);
const choose = patch => ({...defaults,...patch});
const costly = choose({occupation:['soldier'],advantages:['strong','lucky']});
assert.equal(Core.remainingPoints(schema,costly),-6);
assert.equal(Core.validateBuilderValues(schema,costly).ok,false);
// A drawback earns points once, and conflicting perks cannot cancel each other.
assert.equal(Core.remainingPoints(schema,choose({advantages:['strong'],drawbacks:['weak','weak']})),8);
assert.equal(Core.validateBuilderValues(schema,choose({advantages:['strong'],drawbacks:['weak']})).ok,false);
assert.equal(Core.validateBuilderValues(schema,choose({occupation:['soldier'],world:'中世紀戰亂'})).ok,false);
assert.equal(Core.validateBuilderValues(schema,choose({occupation:[]})).ok,false);
assert.equal(Core.validateBuilderValues(schema,choose({occupation:['medic','engineer']})).ok,false);
const selected=choose({advantages:['strong','tough'],drawbacks:['asthma']});
const state=structuredClone(card.gameplay.initial_state);
assert.equal(Core.applyBuilderValues(schema,selected,state),true);
assert.equal(state.modules.player.points,4);
assert.equal(state.modules.vitals.health,150);
assert.equal(state.modules.vitals.max_health,150);
assert.equal(state.modules.vitals.capacity,26);
assert.equal(state.modules.vitals.max_stamina,70);
const once=JSON.stringify(state);
assert.equal(Core.applyBuilderValues(schema,selected,state),true);
assert.equal(JSON.stringify(state),once,'reapplying the setup must not grant bonuses twice');
const fresh=structuredClone(card.gameplay.initial_state), before=JSON.stringify(fresh);
assert.equal(Core.applyBuilderValues(schema,costly,fresh),false);
assert.equal(JSON.stringify(fresh),before,'invalid build must be atomic');
const malformed=structuredClone(schema);
malformed.builder.choice_groups[1].options[0].effects.push({path:'modules.missing.value',delta:1});
assert.equal(Core.applyBuilderValues(malformed,choose({advantages:['strong']}),fresh),false);
assert.equal(JSON.stringify(fresh),before,'missing numeric bonus target must not partly modify setup');
const hostile=structuredClone(schema);
hostile.builder.choice_groups[1].options[0].effects=[{path:'modules.__proto__.polluted',delta:1},{path:'api.key',delta:1}];
assert.equal(Core.normalize(hostile).builder.choice_groups[1].options[0].effects.length,0);
assert.equal({}.polluted,undefined);
// Seeded test generator checks bounded random construction without network/model calls.
let seed=17; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const seen=new Set();
for(let i=0;i<200;i++){
 const values=Core.randomizeBuilderValues(schema,{...defaults,name:'保留姓名',relationship_tone:'同伴與羈絆'},random);
 assert.equal(Core.validateBuilderValues(schema,values).ok,true);
 assert.equal(values.name,'保留姓名'); assert.equal(values.relationship_tone,'同伴與羈絆');seen.add(values.world);
}
assert.equal(seen.size,5);
const context={console,structuredClone,Date,localStorage:{getItem(){return null;}},window:{}};
vm.createContext(context);vm.runInContext(fs.readFileSync('js/character.js','utf8')+'\nthis.engine=CharacterEngine;',context);
const normalized=context.engine.normalize(card);
assert.equal(normalized.world_modules.length,12);
for(const world of schema.builder.fields.find(f=>f.key==='world').options){
 const s=structuredClone(card.gameplay.initial_state);
 assert.equal(Core.applyBuilderValues(schema,choose({world}),s),true);
 const opening=Startup.apply(normalized.story_startup,s,normalized.world_modules);
 assert.ok(opening && opening.selected===world);
 assert.equal(opening.opening.choices.length,4);
 assert.equal(s.modules.run.world,world);
 assert.ok(s.modules.run.special_rules.length>40);
 assert.notEqual(s.modules.run.special_rules,world==='喪屍末日'?'':card.gameplay.initial_state.modules.run.special_rules);
 assert.equal(s.modules.hazards.oxygen,world==='科幻太空'?100:null);
 assert.equal(s.modules.hazards.radiation,world==='核戰廢土'?0:null);
 assert.equal(s.modules.inventory.length,1,'starter package must not be duplicated');
 for(const panel of schema.panels)for(const section of panel.sections){
  if(section.path)assert.notEqual(Core.getPath(s,section.path),undefined,section.path);
  for(const item of section.items||[]){const p=item.path||item.value_path;if(p)assert.notEqual(Core.getPath(s,p),undefined,p);}
 }
 const rendered=Regex.render(opening.greeting,Regex.normalize(card.import_metadata.preserved_source),false);
 assert.equal(rendered.rich,true);
}
const library=card.gameplay.initial_state.worldbookLibrary;
const packs=library.installed.map(Books.normalizePack);
assert.equal(packs[0].entries.length,7);
const recall=Books.select(packs,library.enabled,{latestUser:'科幻太空',world:'lastlight'},{maxChars:1800,maxEntries:3});
assert.ok(recall.text.includes('氧氣'));
console.log('PASS Lastlight: budget, conflicts, world compatibility, atomic/idempotent bonuses, 200 legal random builds, 5 openings, lore/UI/Regex');

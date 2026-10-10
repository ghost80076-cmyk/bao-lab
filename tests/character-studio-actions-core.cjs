'use strict';
const assert = require('node:assert/strict');
const {addInventoryAction:add} = require('../js/character-studio-actions-core.js');
const runtime = require('../js/gameplay-ui-core.js');
const options = {kind:'purchase',label:'購買罐頭',itemId:'cans',itemName:'罐頭',quantity:2,price:15,balance:20};
const effect = card => card.gameplay_ui.panels.find(p=>p.id==='resource-actions').sections.find(s=>s.type==='actions').items.at(-1).effect;
const source = {id:'shop',world_modules:[],initial_state:{location:'市場'},gameplay_ui:{version:1,layout:{preset:'standard'},panels:[{id:'other',label:'任務',sections:[]} ]}};
const before = JSON.stringify(source);
let card = add(source,options);
assert.equal(JSON.stringify(source),before,'builder must not mutate source');
assert.equal(card.initial_state.modules.economy.crystals,20);
assert.deepEqual(card.initial_state.modules.inventory,[]);
assert.deepEqual(card.gameplay_ui.panels[0],source.gameplay_ui.panels[0]);
assert.ok(runtime.normalize(card.gameplay_ui));
const state = {moduleDefinitions:card.world_modules,modules:structuredClone(card.initial_state.modules)};
assert.equal(runtime.executeActionEffect(state,effect(card)).ok,true);
assert.equal(state.modules.economy.crystals,5);
assert.equal(state.modules.inventory[0].quantity,2);
let snapshot = JSON.stringify(state);
assert.equal(runtime.executeActionEffect(state,effect(card)).ok,false);
assert.equal(JSON.stringify(state),snapshot);
card = add(card,{...options,kind:'consume',label:'食用罐頭',quantity:1});
assert.equal(runtime.executeActionEffect(state,effect(card)).ok,true);
assert.equal(state.modules.inventory[0].quantity,1);
card.initial_state.modules.economy.crystals=7;
card.initial_state.modules.inventory=[{id:'cans',name:'自訂名稱',quantity:0,rarity:'rare'}];
const keep=structuredClone(card.initial_state);
const next=add(card,{...options,balance:100});
assert.deepEqual(next.initial_state,keep,'existing balances and metadata must survive');
assert.ok(next.supported_display.ui);
for (const mutation of [
 c=>c.world_modules[0].kind='object', c=>c.world_modules[0].enabled=false,
 c=>c.initial_state.modules.inventory=[{name:'罐頭',quantity:1}],
 c=>c.initial_state.modules.inventory=[{id:'cans',quantity:-1}],
 c=>c.initial_state.modules.inventory=[{id:'cans',quantity:1},{id:'cans',quantity:2}],
 c=>c.initial_state.modules.economy.crystals='20',
 c=>c.world_modules=Array.from({length:12},(_,i)=>({id:'module'+i,kind:'object'})),
 c=>c.gameplay_ui.panels.find(p=>p.id==='resource-actions').sections.find(s=>s.type==='actions').items=Array.from({length:24},()=>({label:'滿'})),
]) {
 const invalid=structuredClone(card);mutation(invalid);snapshot=JSON.stringify(invalid);
 assert.throws(()=>add(invalid,options));assert.equal(JSON.stringify(invalid),snapshot,'failure must preserve source');
}
for(const bad of [{quantity:0},{quantity:1.5},{price:0},{balance:1000000001},{itemId:'constructor'},{inventoryId:'__proto__'},{currencyId:'inventory'},{label:''}]) assert.throws(()=>add({}, {...options,...bad}));
const emptyConsume=add({}, {...options,kind:'consume'});
assert.deepEqual(emptyConsume.initial_state.modules.inventory,[]);
assert.equal(effect(emptyConsume).changes,undefined);
console.log('Character Studio inventory actions PASS: author data, runtime atomicity, preservation and invalid input');
const {inventoryActionOptions:read,updateInventoryAction:update,removeInventoryAction:remove}=require('../js/character-studio-actions-core.js');
const editCard=add({},options), location={panel:0,section:2,item:0};
editCard.gameplay_ui.panels[0].sections[2].items[0].hint='既有提示';
editCard.gameplay_ui.panels[0].sections[2].items[0].draft='另外保留草稿';
const edited=update(editCard,location,{label:'買三罐',quantity:3,price:10,itemName:'保存罐頭',event:'花10晶核'});
assert.equal(read(edited,location).price,10);
assert.equal(read(edited,location).quantity,3);
assert.equal(edited.gameplay_ui.panels.length,1);
assert.equal(edited.gameplay_ui.panels[0].sections[2].items.length,1);
assert.equal(edited.gameplay_ui.panels[0].sections[2].items[0].hint,'既有提示');
assert.equal(edited.gameplay_ui.panels[0].sections[2].items[0].draft,'另外保留草稿');
assert.deepEqual(edited.initial_state,editCard.initial_state);
const noButton=remove(edited,location);
assert.equal(noButton.gameplay_ui.panels[0].sections.length,2);
assert.deepEqual(noButton.initial_state,editCard.initial_state);
assert.deepEqual(noButton.world_modules,editCard.world_modules);
const originalJson=JSON.stringify(editCard);
assert.throws(()=>update(editCard,location,{quantity:0}));assert.equal(JSON.stringify(editCard),originalJson);
assert.throws(()=>remove(editCard,{...location,item:20}));
const complex=structuredClone(editCard);complex.gameplay_ui.panels[0].sections[2].items[0].effect.items.push({path:'modules.inventory',id:'bandages',name:'繃帶',delta:1});
assert.equal(read(complex,location),null);assert.throws(()=>update(complex,location,{quantity:3}));
const nested=structuredClone(editCard);const item=nested.gameplay_ui.panels[0].sections[2].items[0];
nested.gameplay_ui.panels[0].sections=[{type:'tabs',tabs:[{id:'shop',label:'店',sections:[{type:'actions',items:[item]}]},{id:'keep',label:'保留',sections:[{type:'stats',items:[{label:'資源',path:'modules.economy.crystals'}]}]}]}];
const nestedLocation={panel:0,section:0,tab:0,nestedSection:0,item:0};
assert.equal(read(update(nested,nestedLocation,{price:8}),nestedLocation).price,8);
assert.equal(remove(nested,nestedLocation).gameplay_ui.panels[0].sections[0].tabs[0].id,'keep');
console.log('Character Studio edit/remove PASS: same-slot editing, metadata, nested tabs and failure preservation');
const {previewInventoryAction:preview,createActionPreview:seed}=require('../js/character-studio-actions-core.js');
let previewCard=add({},options);
previewCard=add(previewCard,{...options,kind:'consume',label:'食用罐頭',quantity:1});
const previewSource=JSON.stringify(previewCard), buyAt={panel:0,section:2,item:0}, eatAt={...buyAt,item:1};
let simulation=preview(previewCard,eatAt);
assert.equal(simulation.ok,false);assert.deepEqual(simulation.state.modules,previewCard.initial_state.modules);
simulation=preview(previewCard,buyAt,simulation.state);
assert.equal(simulation.ok,true);assert.equal(simulation.state.modules.economy.crystals,5);assert.equal(simulation.state.modules.inventory[0].quantity,2);
const priorState=JSON.stringify(simulation.state);
const blocked=preview(previewCard,buyAt,simulation.state);
assert.equal(blocked.ok,false);assert.equal(JSON.stringify(blocked.state),priorState);assert.equal(JSON.stringify(simulation.state),priorState);
simulation=preview(previewCard,eatAt,simulation.state);
assert.equal(simulation.state.modules.inventory[0].quantity,1);
assert.equal(JSON.stringify(previewCard),previewSource,'preview must not modify author source');
assert.deepEqual(seed(previewCard).modules,previewCard.initial_state.modules,'reset restores original resources');
const builtInDefault=structuredClone(previewCard);delete builtInDefault.world_modules[0].kind;
assert.equal(preview(builtInDefault,buyAt).ok,true);
console.log('Character Studio preview PASS: sequential purchase/consume, stock/funds rollback, reset and isolation');

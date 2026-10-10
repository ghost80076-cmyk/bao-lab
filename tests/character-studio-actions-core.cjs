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

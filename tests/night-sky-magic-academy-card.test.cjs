'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const card=require('../data/characters/general/night-sky-magic-academy.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include night-sky-magic-academy');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'generated academy cover should exist');

assert.equal(card.presentation.opening.type,'nightacademy');
assert.equal(card.presentation.opening.choices.length,4);
assert.equal(card.gameplay.prompt.include_lore,false,'full lore should not repeat every turn');
assert.equal(card.gameplay.prompt.include_npcs,false,'full NPC list should not repeat every turn');
assert.equal(card.gameplay.prompt.include_world_focus,false,'world-focus list should not repeat every turn');

const houses=card.content.profile.houses.map(h=>h.name);
assert.deepEqual(houses,['赤曜院','霧棘院','星潮院','苔庭院']);

const fields=new Map(card.gameplay.character_status.fields.map(f=>[f.key,f]));
for(const key of ['affection','trust','suspicion','rivalry','jealousy','protection','stage','known_information']){
  assert.ok(fields.has(key),`missing per-NPC relationship field ${key}`);
  assert.equal(fields.get(key).context,'relevant');
  assert.equal(fields.get(key).track,true);
}

const modules=new Map(card.gameplay.world_modules.map(m=>[m.id,m]));
for(const id of ['academy_life','magic_skills','schoolwork','mystery_state','clue_log']){
  assert.ok(modules.has(id),`missing world module ${id}`);
}
for(const key of ['charms','potions','herbology','transfiguration','defense','creatures','divination','flight','runes']){
  assert.ok(modules.get('magic_skills').fields.some(f=>f.key===key),`missing magic skill ${key}`);
}

for(const npc of ['賽維爾','凜夏','艾瑪','里歐','夜梟','艾利歐特']){
  assert.ok(card.gameplay.initial_state.character_statuses[npc],`missing initial NPC state for ${npc}`);
}
assert.ok(card.content.dynamic_prompts.some(p=>p.id==='sorting'));
assert.ok(card.content.dynamic_prompts.some(p=>p.id==='npc_xavier'));
assert.match(card.content.system_prompt,/線索與真相分開/);
assert.match(card.content.system_prompt,/未成年，只能維持非性化/);
assert.ok(card.content.system_prompt.length<2200,'recurring academy core prompt should remain compact');

const serialized=JSON.stringify(card);
assert.doesNotMatch(serialized,/霍格沃茨|格蘭芬多|史萊哲林|雷文克勞|赫夫帕夫|魁地奇|哈利波特/i,'published card should use original IP terms');

const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(index,/night-sky-magic-academy\.css/);
assert.match(index,/night-sky-magic-academy-ui\.js/);

console.log('PASS Night Sky Magic Academy original houses, low-token context, NPC states, magic progression and UI assets');

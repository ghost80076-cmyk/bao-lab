'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const card=require('../data/characters/general/unhealed-bonds.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include unhealed-bonds');
assert.equal(card.meta.category,'r18');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'male');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'generated cover/avatar asset should exist');

const cast=card.content.profile.cast;
assert.equal(cast.length,6);
assert.equal(new Set(cast.map(person=>person.id)).size,6);
assert.ok(cast.every(person=>person.age>=18));
assert.deepEqual(card.content.profile.relationship_axes,['親密度','依賴度','健康度']);

assert.equal(card.presentation.opening.type,'unhealed');
assert.equal(card.presentation.opening.choices.length,4);
assert.match(card.content.greeting,/年齡（18\+）/);
assert.match(card.content.greeting,/沈硯、陸景、季沉、許聞、周昱、顧燦/);

assert.equal(card.gameplay.world_modules.some(module=>module.id==='relationship_balance'),false,'shared relationship aggregate should be removed');
for(const key of ['intimacy','dependency','health']){
  const field=card.gameplay.character_status.fields.find(item=>item.key===key);
  assert.ok(field,`missing per-character ${key}`);
  assert.equal(field.type,'number');
  assert.equal(field.min,0);
  assert.equal(field.max,100);
  assert.equal(field.context,'relevant');
}
for(const name of ['沈硯','陸景','季沉','許聞','周昱','顧燦']){
  const status=card.gameplay.initial_state.character_statuses[name];
  assert.ok(status,`missing independent relationship state for ${name}`);
  assert.equal(status.intimacy,35);
  assert.equal(status.dependency,20);
  assert.equal(status.health,60);
}
assert.equal(card.gameplay.prompt.include_profile,false,'author profile should not be sent every turn');
assert.equal(card.gameplay.prompt.include_lore,false,'full six-person lore should be dynamic, not repeated');
assert.equal(card.gameplay.prompt.include_npcs,false,'full NPC list should not be repeated');
assert.equal(card.gameplay.prompt.include_world_focus,false,'world focus list should not be repeated');
assert.ok(card.content.dynamic_prompts.some(block=>block.id==='shenyan'&&block.triggers.includes('沈硯')));
assert.match(card.content.author_instructions,/不提供具體方法、劑量、藏匿技巧/);
assert.match(card.content.system_prompt,/不要把具體傷害方法寫成操作流程/);
assert.match(card.content.author_instructions,/親密度/);
assert.ok(card.content.system_prompt.length<700,'recurring relationship core should stay compact');
assert.doesNotMatch(JSON.stringify(card),/金泳勳|李賢在|李柱延|池昌民|金善旴|孫英宰|TBZ/);

console.log('PASS Unhealed Bonds card, adult cast, relationship axes, opening UI and generated art');

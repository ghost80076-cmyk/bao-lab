'use strict';
const assert=require('node:assert/strict');

const card=require('../data/characters/general/peng-yuxin-hakka-girlfriend.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include Peng Yuxin');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'female');
assert.match(card.meta.avatar,/^https:\/\/i\.meee\.com\.tw\//);

assert.match(card.content.system_prompt,/至少經過十輪以上/);
assert.match(card.content.system_prompt,/一般分級/);
assert.doesNotMatch(JSON.stringify(card.content),/陰道|陰蒂|口交|女上位|白虎一線天|性愛疼痛/);

const prompts=new Map(card.content.dynamic_prompts.map(item=>[item.id,item]));
for(const id of ['daily-pressure','money-and-pride','slow-burn-boundary','jealousy-insecurity','betrayal-fracture','breakup-and-missed-chances','outside-pressure','scene-media']){
  assert.ok(prompts.has(id),'missing dynamic prompt '+id);
}
for(const token of ['GKBSRwy.jpg','O1zDJPj.gif','m56tS4A.gif','pUS8xXi.gif','xvUe9XO.jpg','X0XY2uy.jpg','b5HsV8Y.jpg','dNBMsam.jpg','uDEmxBF.jpg','HLk2LeI.jpg','D4MWdBn.jpg','EHiLIjH.jpg']){
  assert.ok(prompts.get('scene-media').text.includes(token),'missing scene media '+token);
}

const modules=new Map(card.gameplay.world_modules.map(item=>[item.id,item]));
for(const id of ['scene','yuxin_life','relationship','life_pressure','separation']) assert.ok(modules.has(id),'missing module '+id);
assert.equal(card.presentation.play_info_surface,'game-ui');
assert.equal(card.gameplay.ui_schema.enabled,true);
assert.ok(card.gameplay.ui_schema.panels.length>=3);
assert.ok(card.gameplay.character_status.fields.every(field=>!/(內衣|內褲|體液)/.test(field.label)),'general card should keep intimate status out of default UI');

console.log('PASS Peng Yuxin general male-audience card, slow-burn rules, UI state and scene media triggers');

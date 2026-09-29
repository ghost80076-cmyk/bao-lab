'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const webpDimensions=file=>{
  const data=fs.readFileSync(file), signature=data.indexOf(Buffer.from([0x9d,0x01,0x2a]));
  assert.ok(signature>=0,`${file} should contain a decodable VP8 frame`);
  return {width:data.readUInt16LE(signature+3)&0x3fff,height:data.readUInt16LE(signature+5)&0x3fff};
};

const card=require('../data/characters/general/night-sky-magic-academy.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include night-sky-magic-academy');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'generated academy cover should exist');
assert.match(card.meta.avatar,/night-sky-academy-cover-v2\.webp$/,'academy should use a direct browser image instead of the embedded SVG thumbnail');
assert.deepEqual(webpDimensions(path.join(__dirname,'..',card.meta.avatar)),{width:1774,height:887});

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

assert.equal(card.gameplay.ui_schema?.version,1,'academy should opt in to Gameplay UI Engine v1');
assert.equal(card.gameplay.ui_schema.theme?.preset,'arcane-night','academy gameplay UI should keep its own visual identity');
assert.equal(card.gameplay.ui_schema.theme?.meter,'glow','academy magic meters should use the themed glow treatment');
const gameplayPanels=new Map(card.gameplay.ui_schema.panels.map(panel=>[panel.id,panel]));
for(const id of ['status','magic','mystery']) assert.ok(gameplayPanels.has(id),`missing gameplay UI panel ${id}`);
assert.ok(gameplayPanels.get('magic').sections.some(section=>section.type==='meters'),'magic panel should use generic meter sections');
assert.ok(gameplayPanels.get('mystery').sections.some(section=>section.type==='list'&&section.path==='modules.clue_log'),'mystery panel should expose clue log through the generic list renderer');

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
const academyUI=fs.readFileSync(path.join(__dirname,'../js/night-sky-magic-academy-ui.js'),'utf8');
assert.match(academyUI,/<div class="magic-hero-art"><img/,'academy detail hero should use a directly loadable image element');
assert.doesNotMatch(academyUI,/originalRenderUIPanel/,'academy-specific status renderer should be retired after schema migration');

console.log('PASS Night Sky Magic Academy original houses, low-token context, NPC states, magic progression and UI assets');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const card=require('../data/characters/general/k-idol-survival-simulator.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include k-idol-survival-simulator');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'idol survival cover should exist');
const coverPath=path.join(__dirname,'..',card.meta.avatar);
const cover=fs.readFileSync(coverPath);
assert.equal(path.extname(coverPath),'.webp','idol survival cover should use the deployed WebP asset');
assert.equal(cover.subarray(0,4).toString('ascii'),'RIFF','cover should be a valid RIFF WebP file');
assert.equal(cover.subarray(8,12).toString('ascii'),'WEBP','cover should be a valid WebP file');
const frame=cover.indexOf(Buffer.from([0x9d,0x01,0x2a]));
assert.ok(frame>=0,'lossy WebP frame header should exist');
const width=cover.readUInt16LE(frame+3)&0x3fff;
const height=cover.readUInt16LE(frame+5)&0x3fff;
assert.ok(width>=1600 && height>=800,`cover should remain high resolution, got ${width}x${height}`);
assert.equal(card.presentation.play_info_surface,'game-ui','custom simulator UI must remain the Play information surface');
assert.equal(card.presentation.opening.type,'idolsurvival');
assert.equal(card.presentation.opening.choices.length,4);
assert.equal(card.gameplay.prompt.include_lore,false,'full lore should not repeat every turn');
assert.equal(card.gameplay.prompt.include_npcs,false,'full NPC list should not repeat every turn');
assert.equal(card.gameplay.prompt.include_world_focus,false,'world-focus list should not repeat every turn');

const modules=new Map(card.gameplay.world_modules.map(m=>[m.id,m]));
for(const id of ['survival_show','trainee_profile','ranking_state','stage_state','pressure_state','elimination_log']){
  assert.ok(modules.has(id),`missing world module ${id}`);
}
for(const key of ['vocal','dance','visual','talent','trait']){
  assert.ok(modules.get('trainee_profile').fields.some(f=>f.key===key),`missing trainee field ${key}`);
}
const fields=new Map(card.gameplay.character_status.fields.map(f=>[f.key,f]));
for(const key of ['company','vocal','dance','visual','talent','trait','attitude','trust','rivalry','warmth','distance','known_information']){
  assert.ok(fields.has(key),`missing per-NPC field ${key}`);
  assert.equal(fields.get(key).context,'relevant');
  assert.equal(fields.get(key).track,true);
}
assert.match(card.content.system_prompt,/同性別、同國籍/);
assert.match(card.content.system_prompt,/日常不顯示精確票數/);
assert.match(card.content.system_prompt,/未成年角色維持非性化/);
assert.match(card.content.system_prompt,/平行世界/);
assert.ok(card.content.system_prompt.length<2300,'recurring idol core prompt should remain compact');
assert.ok(card.content.dynamic_prompts.some(p=>p.id==='fanwork_import'));
assert.ok(card.content.dynamic_prompts.some(p=>p.id==='ranking'));

const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(index,/k-idol-survival-simulator\.css/);
assert.match(index,/k-idol-survival-simulator-ui\.js/);
const idolUI=fs.readFileSync(path.join(__dirname,'../js/k-idol-survival-simulator-ui.js'),'utf8');
assert.match(idolUI,/box\.id='idol-survival-setup'/);
assert.match(idolUI,/核心練習生 NPC 必須與玩家同性別、同國籍/);
assert.match(idolUI,/確認資料・進入節目/);

console.log('PASS K-idol survival simulator rules, low-token state, fanwork import, ranking and UI');

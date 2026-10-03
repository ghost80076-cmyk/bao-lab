'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const card=require('../data/characters/general/narcissus-simulator.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include narcissus-simulator');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');

const coverPath=path.join(__dirname,'..',card.meta.avatar);
assert.ok(fs.existsSync(coverPath),'narcissus cover should exist');
const cover=fs.readFileSync(coverPath);
assert.equal(path.extname(coverPath),'.webp');
assert.equal(cover.subarray(0,4).toString('ascii'),'RIFF');
assert.equal(cover.subarray(8,12).toString('ascii'),'WEBP');
const frame=cover.indexOf(Buffer.from([0x9d,0x01,0x2a]));
assert.ok(frame>=0,'lossy WebP frame header should exist');
const width=cover.readUInt16LE(frame+3)&0x3fff;
const height=cover.readUInt16LE(frame+5)&0x3fff;
assert.equal(width,220);
assert.equal(height,391);

assert.equal(card.presentation.play_info_surface,'game-ui');
assert.equal(card.presentation.opening.choices.length,4);
assert.equal(card.gameplay.prompt.include_creator_notes,false);
assert.equal(card.gameplay.prompt.include_dynamic_prompts,true);
assert.match(card.content.system_prompt,/任何人生階段都可以被建立/);
assert.match(card.content.system_prompt,/不是心理治療/);
assert.match(card.content.system_prompt,/年齡不是價值排序/);
assert.ok(card.content.system_prompt.length<1800,'recurring Narcissus core prompt should remain compact');

const prompts=new Map(card.content.dynamic_prompts.map(item=>[item.id,item]));
for(const id of ['mirror_creation','mirror_reflection','mirror_impression','relationship_query','past_self']){
  assert.ok(prompts.has(id),`missing dynamic prompt ${id}`);
}

const modules=new Map(card.gameplay.world_modules.map(item=>[item.id,item]));
for(const id of ['mirror_profile','mirror_relation','reflection']) assert.ok(modules.has(id),`missing module ${id}`);
assert.ok(modules.get('mirror_relation').fields.every(field=>field.type==='text'),'mirror relationship should stay qualitative');

const ui=card.gameplay.ui_schema;
assert.equal(ui.theme.preset,'arcane-night');
assert.equal(ui.builder.title,'建立另一個自己');
const version=ui.builder.fields.find(field=>field.key==='mirror_version');
for(const option of ['現在的我','過去的我','童年的我','青春期的我','性轉的我','理想中的我','自訂']){
  assert.ok(version.options.includes(option),`missing mirror version option ${option}`);
}
const actionLabels=ui.panels.flatMap(panel=>panel.sections)
  .filter(section=>section.type==='actions')
  .flatMap(section=>section.items.map(item=>item.label));
for(const label of ['查看完整檔案','修改設定','他／她眼中的我','關係狀態','鏡面回望','自我反思']){
  assert.ok(actionLabels.includes(label),`missing author-tool action ${label}`);
}

assert.doesNotMatch(JSON.stringify(card),/好感度\s*[+\-]|信任度\s*[+\-]|性慾值/);
console.log('PASS Narcissus emotional core, mirror builder, qualitative relationship tools and cover');

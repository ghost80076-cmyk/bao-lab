'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const webpDimensions=file=>{
  const data=fs.readFileSync(file), signature=data.indexOf(Buffer.from([0x9d,0x01,0x2a]));
  assert.ok(signature>=0,`${file} should contain a decodable VP8 frame`);
  return {width:data.readUInt16LE(signature+3)&0x3fff,height:data.readUInt16LE(signature+5)&0x3fff};
};
const card=require('../data/characters/general/host-club-simulator.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include host-club-simulator');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'male');
assert.doesNotMatch(card.content.greeting,/R18|18\+ 成人向/,'public catalog should not expose R18 badge');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'generated host cast art should exist');
assert.match(card.meta.avatar,/hostsim-hero-v2\.webp$/,'catalog and detail should use the high-resolution hero');
assert.deepEqual(webpDimensions(path.join(__dirname,'..',card.meta.avatar)),{width:1672,height:941});
for(const name of ['ren','haru','rei','sena','kyo','nagi']){
  const portrait=path.join(__dirname,`../assets/hostsim-${name}-portrait-v3.webp`);
  assert.ok(fs.existsSync(portrait),`missing standalone ${name} portrait`);
  assert.deepEqual(webpDimensions(portrait),{width:1122,height:1402});
}

const cast=card.content.profile.cast;
assert.equal(cast.length,6);
assert.equal(new Set(cast.map(person=>person.id)).size,6);
assert.ok(cast.every(person=>person.age>=18));
for(const name of ['REN','HARU','REI','SENA','KYO','NAGI']) assert.ok(cast.some(person=>person.name===name));

const modules=new Map(card.gameplay.world_modules.map(module=>[module.id,module]));
for(const id of ['player_stats','host_relation','nightlife','work_life']) assert.ok(modules.has(id),`missing module ${id}`);
for(const key of ['money','charm','conversation','mood','health']) assert.ok(modules.get('player_stats').fields.some(field=>field.key===key));
for(const key of ['host','stage']) assert.ok(modules.get('host_relation').fields.some(field=>field.key===key));
for(const key of ['importance','affection','dependency','guard','visits','spend','stage']){
  const field=card.gameplay.character_status.fields.find(item=>item.key===key);
  assert.ok(field,`missing per-host status field ${key}`);
  assert.equal(field.track,true);
}
for(const name of ['REN','HARU','REI','SENA','KYO','NAGI']){
  const status=card.gameplay.initial_state.character_statuses[name];
  assert.ok(status,`missing initial status for ${name}`);
  assert.equal(status.importance,0);
  assert.equal(status.affection,0);
  assert.equal(status.visits,0);
}

assert.equal(card.presentation.play_info_surface,'game-ui','custom simulator UI must remain the Play information surface');
assert.equal(card.presentation.opening.type,'hostsim');
assert.equal(card.presentation.opening.choices.length,4);
assert.match(card.content.system_prompt,/重要度＝玩家對該牛郎職業與業績的重要性/);
assert.match(card.content.system_prompt,/好感度＝他私下對玩家的真實看法/);
assert.match(card.content.system_prompt,/白天現實生活／工作/);
assert.match(card.content.system_prompt,/不寫器官、體液、性交步驟/);
assert.match(card.content.author_instructions,/不提供方法與效率資訊/);
assert.equal(card.gameplay.prompt.include_lore,false,'full six-host lore must not be sent every turn');
assert.equal(card.gameplay.prompt.include_npcs,false,'full NPC catalog must not be sent every turn');
assert.equal(card.gameplay.prompt.include_world_focus,false,'world focus list must not be repeated every turn');
assert.ok(card.content.dynamic_prompts.some(block=>block.id==='host_ren'&&block.triggers.includes('ren')));
assert.ok(card.content.system_prompt.length<1000,'recurring core prompt should stay compact');
assert.doesNotMatch(JSON.stringify(card),/金泳勳|李賢在|李柱延|池昌民|金善旴|孫英宰|TBZ/);

const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(index,/host-club-simulator\.css/);
assert.match(index,/host-club-simulator-ui\.js/);
const hostUI=fs.readFileSync(path.join(__dirname,'../js/host-club-simulator-ui.js'),'utf8');
assert.match(hostUI,/hostsim-\$\{key\}-portrait-v3\.webp/,'cast cards should render one standalone portrait per host');
assert.match(hostUI,/<img class="hostsim-card-photo"/,'cast cards should use real image elements instead of sprite backgrounds');
assert.match(hostUI,/<img src=.*heroArt/,'detail hero should use a real image element');

console.log('PASS Host Club Simulator card, adult cast, economy, host relationship axes and custom UI');

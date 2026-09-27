'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const card=require('../data/characters/general/host-club-simulator.json');
const manifest=require('../data/characters.json');

assert.ok(manifest.some(entry=>entry.id===card.meta.id),'manifest should include host-club-simulator');
assert.equal(card.meta.category,'r18');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'male');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)),'generated host cast art should exist');

const cast=card.content.profile.cast;
assert.equal(cast.length,6);
assert.equal(new Set(cast.map(person=>person.id)).size,6);
assert.ok(cast.every(person=>person.age>=18));
for(const name of ['REN','HARU','REI','SENA','KYO','NAGI']) assert.ok(cast.some(person=>person.name===name));

const modules=new Map(card.gameplay.world_modules.map(module=>[module.id,module]));
for(const id of ['player_stats','host_relation','nightlife','work_life']) assert.ok(modules.has(id),`missing module ${id}`);
for(const key of ['money','charm','conversation','mood','health']) assert.ok(modules.get('player_stats').fields.some(field=>field.key===key));
for(const key of ['host','importance','affection','dependency','guard','stage']) assert.ok(modules.get('host_relation').fields.some(field=>field.key===key));

assert.equal(card.presentation.opening.type,'hostsim');
assert.equal(card.presentation.opening.choices.length,4);
assert.match(card.content.system_prompt,/重要度是玩家對該牛郎職業與業績的重要性/);
assert.match(card.content.system_prompt,/好感度是牛郎私下對玩家的真實看法/);
assert.match(card.content.system_prompt,/白天現實生活／工作/);
assert.match(card.content.author_instructions,/不要描寫性器官、體液、性交步驟/);
assert.match(card.content.author_instructions,/不提供方法與效率資訊/);
assert.doesNotMatch(JSON.stringify(card),/金泳勳|李賢在|李柱延|池昌民|金善旴|孫英宰|TBZ/);

const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(index,/host-club-simulator\.css/);
assert.match(index,/host-club-simulator-ui\.js/);

console.log('PASS Host Club Simulator card, adult cast, economy, host relationship axes and custom UI');

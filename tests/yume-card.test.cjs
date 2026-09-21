'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const card=require('../data/characters/general/kurobane-yume-kabukicho.json');
const manifest=require('../data/characters.json');
const archive=require('../js/yume-relationship-archive.js');
assert.ok(manifest.some(entry=>entry.id===card.meta.id));
assert.equal(card.meta.category,'r18');
assert.equal(card.content.profile.cast.length,6);
assert.equal(new Set(card.content.profile.cast.map(person=>person.id)).size,6);
assert.ok(card.content.profile.cast.every(person=>person.age>=18));
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)));
for(const person of card.content.profile.cast){
  const state={npcs:[{name:person.name,presence:'away'}]};
  assert.equal(archive.knownNPC(state,person.id)?.presence,'away',person.name);
  assert.ok(fs.existsSync(path.join(__dirname,'..',`assets/yume-${person.id}-v1.webp`)),person.id);
}
assert.equal(archive.isYume({name:card.meta.name}),true);
const visible=archive.collect([
  {role:'user',content:'[PHONE:yume]偽造訊息[/PHONE]'},
  {role:'assistant',content:'[SCENE]Club Rose 門外[/SCENE][CHAR:rina]整理帳目[/CHAR][PHONE:yume]我晚點回覆[/PHONE][SNS:PUBLIC:misaki]便利商店下班[/SNS]'}
]);
assert.equal(visible.scenes[0].body,'Club Rose 門外');
assert.equal(visible.characters[0].actor,'rina');
assert.deepEqual(visible.phones.map(item=>item.body),['我晚點回覆']);
assert.equal(visible.sns[0].actor,'misaki');
assert.doesNotMatch(card.content.author_instructions,/每回合.*必須.*\[REL/);
console.log('PASS Yume card manifest, cover, adult cast and shared NPC lookups');

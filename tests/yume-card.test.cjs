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
assert.doesNotMatch(card.content.author_instructions,/每回合.*必須.*\[REL/);
console.log('PASS Yume card manifest, cover, adult cast and shared NPC lookups');

'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/2e/lu-yan-rogue-devotion.json');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'lu-yan-rogue-devotion');
assert.equal(card.meta.title,'陸炎｜痞壞背後的深情');
assert.ok(String(card.content?.greeting||'').length>100);
assert.match(card.content.greeting,/酒吧「焰」/);
assert.ok(card.gameplay,'missing gameplay');
assert.ok(card.presentation,'missing presentation');

console.log('PASS Lu Yan card parses as valid JSON');

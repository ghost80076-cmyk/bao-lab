'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, '..', 'data/characters/community/2e/lu-yan-rogue-devotion.json');
const raw = fs.readFileSync(filePath, 'utf8');

let card;
assert.doesNotThrow(() => {
  card = JSON.parse(raw);
}, 'Lu Yan card must remain valid strict JSON');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'lu-yan-rogue-devotion');
assert.equal(card.meta.title, '陸炎｜痞壞背後的深情');
assert.ok(String(card.content?.greeting || '').length > 100);

console.log('PASS Lu Yan card is valid strict JSON');

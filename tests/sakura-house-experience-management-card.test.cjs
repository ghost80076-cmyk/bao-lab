'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/64/sakura-house-experience-management.json');
const regex=require('../data/characters/community/64/sakura-house-experience-management.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'sakura-house-experience-management');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/ln7eHgA.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

for(const pattern of [/妓院/,/成人服務/,/黑幫/,/灰色產業/,/VIP/,/股東/,/懷孕/,/警方/]) assert.match(card.content.system_prompt,pattern);
assert.match(card.content.author_instructions,/保留原版的 R18/);
assert.match(card.content.author_instructions,/不要把作品改成普通戀愛會所/);
assert.match(card.content.system_prompt,/作品名稱不得成為 NPC/);
assert.doesNotMatch(card.content.greeting,/hc-collapse|hc-btn|hc-stat/i);
assert.match(card.content.greeting,/YB:SAKURA:OPENING/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['adult-service','staff-generation','staff-management','vip-shareholder','daily-ledger','gang-pressure','police-politics','competition-poaching','gray-industry','health-life-event','special-customer','time-offscreen','crisis-event']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','venue','finance','staff','staff_roster','factions','holdings','risk','relationships','open_threads','event_log']) assert.ok(moduleIds.has(id),'missing '+id);

const npcNames=card.gameplay.initial_state.npcs.map(x=>x.name);
assert.deepEqual(npcNames,['小雅','櫻井美咲','藤原雪乃']);
assert.ok(!npcNames.includes(card.meta.name));
assert.ok(!npcNames.includes(card.meta.title));

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','house','staff','underworld','empire','threads','actions']);
assert.ok(ui.builder.fields.some(x=>x.key==='start_identity'));
assert.ok(ui.builder.fields.some(x=>x.key==='route_focus'));
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===21));

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.every(rule=>!rule.reason));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:SAKURA:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:SAKURA:LEDGER')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:SAKURA:UNDERWORLD')&&rule.rich));

console.log('PASS Sakura House adult management card with native UI, dynamic prompts and author Regex');

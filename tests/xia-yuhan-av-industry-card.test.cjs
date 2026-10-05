'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/7c/xia-yuhan-av-industry.json');
const regex=require('../data/characters/community/7c/xia-yuhan-av-industry.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'xia-yuhan-av-industry');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'female');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/brJX3IP.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/片場不是考場/);
assert.match(card.content.system_prompt,/不要使用「等級／XP／技能樹」/);
assert.match(card.content.system_prompt,/四個面向/);
assert.match(card.content.system_prompt,/諧音魅魔/);
assert.match(card.content.system_prompt,/Action/);
assert.match(card.content.system_prompt,/Cut/);
assert.doesNotMatch(card.content.system_prompt,/800 字以上/);
assert.doesNotMatch(card.content.system_prompt,/每個階段都要有詳細/);

assert.match(card.content.greeting,/YB:AV:OPENING/);
assert.doesNotMatch(card.content.greeting,/YB:AV:SETUP/);
assert.match(card.content.system_prompt,/【開局資料來源】/);
assert.match(card.content.system_prompt,/不得再問一次姓名/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const pid of ['xia-wordplay','on-camera','cut-backstage','adult-scene','scene-evaluation','audience-live','industry-motion','npc-lifecycle']) assert.ok(promptIds.has(pid),'missing '+pid);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const mid of ['scene_state','player_profile','condition','career','xia_yuhan','scene_feedback','scene_participants','industry_contacts','projects','audience_buzz','open_threads','production_log']) assert.ok(moduleIds.has(mid),'missing '+mid);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.ok(ui.builder.fields.some(x=>x.key==='role'));
assert.ok(ui.builder.fields.some(x=>x.key==='reason'));
assert.ok(ui.builder.fields.some(x=>x.key==='experience'));
assert.ok(ui.builder.fields.some(x=>x.key==='tone'));
assert.deepEqual(ui.panels.map(x=>x.id),['studio','you','yuhan','career','threads','actions']);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AV:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AV:SETUP')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AV:EVAL')&&rule.rich));

console.log('PASS Xia Yuhan AV industry card with light career progression, native UI, dynamic prompts and author Regex');

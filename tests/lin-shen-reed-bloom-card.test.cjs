'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/50/lin-shen-reed-bloom.json');
const regex=require('../data/characters/community/50/lin-shen-reed-bloom.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'lin-shen-reed-bloom');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'male');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/ibj9QsA.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');
assert.match(card.content.system_prompt,/25 歲/);
assert.match(card.content.system_prompt,/女性向一般分級/);
assert.match(card.content.profile['象徵物'],/蘆葦花/);
assert.match(card.content.greeting,/【YB:LINSHEN:OPENING】/);
assert.match(card.content.greeting,/【YB:LINSHEN:ACTIONS】/);
assert.doesNotMatch(card.content.greeting,/好感度|守護深度|心跳.*%/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['care-details','being-cared-for','jealousy-withdrawal','relationship-turn','river-memory']) assert.ok(promptIds.has(id),'missing '+id);
const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','lin_shen','relationship','continuity']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'parchment');
assert.deepEqual(ui.panels.map(x=>x.id),['now','linshen','between','actions']);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.every(rule=>!rule.reason));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:LINSHEN:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:LINSHEN:ACTIONS')&&rule.rich&&!rule.script));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('妳觀察到的可能情緒')));

console.log('PASS Lin Shen general female card with native UI and author Regex frontend');

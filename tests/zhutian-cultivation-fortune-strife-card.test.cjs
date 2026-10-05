'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/28/zhutian-cultivation-fortune-strife.json');
const regex=require('../data/characters/community/28/zhutian-cultivation-fortune-strife.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'zhutian-cultivation-fortune-strife');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/hpeZ6ff.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/氣運不是作者作弊碼|氣運代表/);
assert.match(card.content.system_prompt,/越階是例外/);
assert.match(card.content.system_prompt,/【機緣與位面情報】/);
assert.match(card.content.system_prompt,/天命者.*不會因玩家出現就自動成為朋友或宿敵/s);
assert.doesNotMatch(card.content.system_prompt,/林動|蕭炎|唐三|韓立|方運|雲韻|小醫仙|比比東/);
assert.doesNotMatch(card.content.greeting,/完整狀態欄|胸圍|體液|興奮度/);

for(const marker of ['YB:CULT:OPENING','YB:CULT:ACTIONS']) assert.match(card.content.greeting,new RegExp(marker));

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const pid of ['breakthrough','divine-sense','fortune-collision','opportunity','combat','goldfinger','plane-travel','sect-faction','time-offscreen','npc-lifecycle']) assert.ok(promptIds.has(pid),'missing '+pid);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const mid of ['scene','player','cultivation','fortune','goldfinger','resources','techniques','inventory','opportunities','scene_participants','known_people','affiliations','missions','rumours','event_log']) assert.ok(moduleIds.has(mid),'missing '+mid);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.ok(ui.builder.fields.some(x=>x.key==='origin'));
assert.ok(ui.builder.fields.some(x=>x.key==='realm'));
assert.ok(ui.builder.fields.some(x=>x.key==='fortune_grade'));
assert.ok(ui.builder.fields.some(x=>x.key==='goldfinger_type'));
assert.deepEqual(ui.panels.map(x=>x.id),['now','cultivator','fate','arts','resources','world','threads','actions']);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:CULT:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:CULT:OMEN')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:CULT:ACTIONS')&&rule.rich));

console.log('PASS zhutian cultivation fortune strife with builder, native UI, dynamic prompts and author Regex');

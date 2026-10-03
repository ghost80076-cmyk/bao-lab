'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/ae/aetheria-three-factions.json');
const regex=require('../data/characters/community/ae/aetheria-three-factions.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'aetheria-three-factions');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/GxAeyMx.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/作品名稱.*不是角色名稱/);
assert.match(card.content.system_prompt,/21 歲以上/);
assert.match(card.content.system_prompt,/生命精華/);
assert.match(card.content.system_prompt,/性相關體液/);
assert.match(card.content.system_prompt,/玩家視角/);
assert.match(card.content.system_prompt,/資訊隔離/);
assert.match(card.content.system_prompt,/艾莉西亞/);
assert.match(card.content.system_prompt,/莉莉絲｜22 歲/);
assert.match(card.content.system_prompt,/卡珊德拉/);
assert.doesNotMatch(card.content.greeting,/hc-h1|hc-n|hc-collapse/);

for(const marker of ['YB:AETHERIA:OPENING','YB:AETHERIA:MARKET','YB:AETHERIA:ACTIONS']) {
  assert.match(card.content.greeting,new RegExp(marker));
}

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['essence-market','faction-motion','adult-essence','coercion-conflict','core-cast','world-exploration','npc-lifecycle','secret-information']) {
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','market','factions','scene_participants','known_people','inventory','contracts','rumours','open_threads','event_log']) {
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#d4af37');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','market','world','people','threads','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===21));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.every(rule=>!rule.reason));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AETHERIA:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AETHERIA:MARKET')&&rule.rich&&!rule.script));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:AETHERIA:ACTIONS')&&rule.rich&&!rule.script));

console.log('PASS Aetheria adult world card with native UI, builder, dynamic prompts and author Regex');

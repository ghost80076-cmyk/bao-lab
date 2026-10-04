'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/bf/medieval-guild-dynasty-simulator.json');
const regex=require('../data/characters/community/bf/medieval-guild-dynasty-simulator.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'medieval-guild-dynasty-simulator');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/lgQj30n.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/五個家族/);
assert.match(card.content.system_prompt,/相同的資源約束/);
assert.match(card.content.system_prompt,/rival_strategy/);
assert.match(card.content.system_prompt,/資訊隔離/);
assert.match(card.content.system_prompt,/1d100/);
assert.match(card.content.system_prompt,/每日最大行動點/);
assert.match(card.content.system_prompt,/成人親密互動只限 18\+/);
assert.doesNotMatch(card.content.system_prompt,/1歲即成年|一歲即成年/);
assert.doesNotMatch(card.content.greeting,/hc-btn|<input|<details|onclick/);

for(const marker of ['YB:MEDIEVAL:OPENING','YB:MEDIEVAL:BULLETIN']){
  assert.match(card.content.greeting,new RegExp(marker));
}

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of [
  'opening-rival-generation','action-point-time','skill-check','business-settlement',
  'rival-family-turn','market-season','resource-auction','office-election',
  'crime-law','transport-risk','workers','family-succession','combat',
  'time-skip','public-bulletin'
]){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of [
  'scene','player','attributes','action_points','survival','house','economy',
  'businesses','workers','rival_families','rival_strategy','market','resources',
  'offices','law','skills','check','scene_participants','known_people',
  'inventory','rumours','active_matters','day_ledger','event_log'
]){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.builder.point_pool,10);
assert.equal(ui.builder.attributes.length,5);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min>=18));
assert.ok(ui.builder.fields.some(x=>x.key==='occupation'));
assert.ok(ui.builder.fields.some(x=>x.key==='house_name'));
assert.ok(ui.builder.fields.some(x=>x.key==='seat'));
assert.ok(ui.builder.fields.some(x=>x.key==='rival_tone'));
assert.deepEqual(
  ui.panels.map(x=>x.id),
  ['now','founder','house','business','world','intel','trpg','ledger','actions']
);

const visiblePanelJson=JSON.stringify(card.gameplay.ui_schema.panels);
assert.doesNotMatch(visiblePanelJson,/rival_strategy/);
assert.equal(card.gameplay.initial_state.modules.rival_families.length,0);
assert.equal(card.gameplay.initial_state.modules.rival_strategy.length,0);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,4);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,4);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MEDIEVAL:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MEDIEVAL:CHECK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MEDIEVAL:BULLETIN')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MEDIEVAL:DAY_END')&&rule.rich));

console.log('PASS medieval guild dynasty simulator with five-house AI competition, builder, native UI, dynamic prompts and author Regex');

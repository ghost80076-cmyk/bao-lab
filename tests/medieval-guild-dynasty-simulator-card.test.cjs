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
assert.match(card.content.system_prompt,/生活質感/);
assert.match(card.content.system_prompt,/不要使用「中世紀人從不洗澡」/);
assert.match(card.content.system_prompt,/理髮外科/);
assert.match(card.content.system_prompt,/權力交換與庇護政治/);
assert.match(card.content.system_prompt,/職業不是標籤/);
assert.match(card.content.system_prompt,/衍生能力/);
assert.match(card.content.system_prompt,/競爭家族公開情報/);
assert.match(card.content.system_prompt,/rank_progress/);
assert.match(card.content.greeting,/第 1 年，春/);
assert.match(card.content.greeting,/另外四個新興家族/);
assert.doesNotMatch(card.content.greeting,/職業路線|Character Builder|先選好你的職業與能力/);
assert.match(card.content.system_prompt,/【開局資料來源】/);
assert.match(card.content.system_prompt,/不得再要求玩家選職業或重新分配能力/);
assert.match(card.content.lore,/農民｜500金｜STR\+1｜CON\+1/);
assert.match(card.content.lore,/煉金師｜1250金｜INT\+3｜PER\+1/);
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
  'time-skip','public-bulletin','medieval-sensory-life','bath-barber-grooming','adult-power-intimacy','patronage-power-network',
  'occupation-package','derived-stat-refresh','rank-advancement','rival-public-intel'
]){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of [
  'scene','player','attributes','action_points','survival','house','economy',
  'businesses','workers','rival_families','rival_strategy','market','resources',
  'offices','law','skills','check','scene_participants','known_people',
  'inventory','rumours','active_matters','day_ledger','event_log','urban_life','power_network',
  'derived_stats','rank_progress'
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
assert.match(ui.builder.description,/職業加成在15點之外套用/);
const founderPanel=ui.panels.find(x=>x.id==='founder');
assert.ok(founderPanel.sections.some(x=>x.title==='衍生能力'));
assert.ok(founderPanel.sections.some(x=>x.title==='階級晉升'));
assert.ok(founderPanel.sections.find(x=>x.title==='主屬性').items.every(x=>x.max===10));
assert.equal(card.gameplay.initial_state.modules.rank_progress.current,'農奴');
assert.equal(card.gameplay.initial_state.modules.rank_progress.next,'平民');
assert.equal(card.gameplay.initial_state.modules.derived_stats.con,3);
assert.match(JSON.stringify(card.gameplay.ui_schema.panels),/四大家族｜公開情報/);
assert.deepEqual(
  ui.panels.map(x=>x.id),
  ['now','founder','house','business','world','intel','trpg','actions']
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

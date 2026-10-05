'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/e7/elze-survival-world.json');
const regex=require('../data/characters/community/e7/elze-survival-world.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'elze-survival-world');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/CvCfmDN.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/生存沙盒/);
assert.match(card.content.system_prompt,/預設不擲骰/);
assert.match(card.content.system_prompt,/21\+ 虛構成年人/);
assert.doesNotMatch(card.content.greeting,/hc-collapse|hc-h1|hc-n/);

for(const marker of ['YB:ELZE:OPENING','YB:ELZE:NOTICE']) {
  assert.match(card.content.greeting,new RegExp(marker));
}
assert.doesNotMatch(card.content.greeting,/YB:ELZE:AWAKENING/);
assert.match(card.content.system_prompt,/【開局落點】/);
assert.match(card.content.system_prompt,/非覺醒神殿開局不得被強制拉回神殿/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['survival-pressure','combat','guild-quest','race-encounter','material-hunting','adult-race-intimacy','death-risk','war-faction','territory-development','time-offscreen','npc-lifecycle','secret-information']) {
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','survival','economy','guild','factions','scene_participants','known_people','inventory','quests','race_compendium','territory','rumours','open_threads','event_log']) {
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#d1ad6f');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','survival','guild','world','people','territory','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===21));
assert.ok(ui.builder.fields.some(x=>x.key==='start_mode'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));

assert.equal(card.gameplay.initial_state.world_clock.version,1);
assert.equal(card.gameplay.initial_state.world_clock.tick_minutes,0);
assert.equal(card.gameplay.initial_state.world_clock.next_event_seq,1);
assert.deepEqual(card.gameplay.initial_state.world_clock.scheduled_events,[]);
assert.match(card.content.system_prompt,/夜灣的【世界時鐘】只負責故事內部的相對時間累積/);
assert.match(card.content.system_prompt,/scene\.date／scene\.time 與 time 仍是玩家看到的艾爾曆與時段/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='survival-pressure').text,/依實際經過時間與條件判斷/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='guild-quest').text,/讓夜灣世界時鐘建立或追蹤排程/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='guild-quest').text,/不要硬造精確期限/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='time-offscreen').text,/不代表自動完成、失敗或結算/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='time-offscreen').text,/不要為了填排程自行創造新事件/);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.every(rule=>!rule.reason));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ELZE:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ELZE:NOTICE')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ELZE:AWAKENING')&&rule.rich));

console.log('PASS Elze survival world card with native UI, builder, dynamic prompts and author Regex');

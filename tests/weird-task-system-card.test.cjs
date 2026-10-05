'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/8f/weird-task-system.json');
const regex=require('../data/characters/community/8f/weird-task-system.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'weird-task-system');
assert.equal(card.meta.name,'詭異任務系統');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/u20KRg5.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/規則怪談/);
assert.match(card.content.system_prompt,/真實規則/);
assert.match(card.content.system_prompt,/誤導資訊/);
assert.match(card.content.system_prompt,/平靜期/);
assert.doesNotMatch(card.content.system_prompt,/性交|處女性|懷孕風險/);
assert.doesNotMatch(card.content.greeting,/hc-h1|hc-stat|hc-bar|hc-collapse|<style|<script/);

for(const marker of ['YB:ODD:OPENING','YB:ODD:SYSTEM']) assert.match(card.content.greeting,new RegExp(marker));

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['task-generation','rule-engine','clue-contradiction','sanity-pollution','npc-anomaly','task-resolution','between-tasks','recurring-mystery','time-offscreen','anti-repetition']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','condition','system_link','active_task','task_truth','known_rules','clues','scene_participants','known_people','anomaly_records','inventory','recurring_signs','open_threads','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.builder.point_pool,0);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===18));
assert.ok(ui.builder.fields.some(x=>x.key==='identity'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','task','records','people','items','actions']);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,4);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,4);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ODD:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ODD:SYSTEM')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ODD:TASK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:ODD:RULES')&&rule.rich));

console.log('PASS weird task system with rule-horror engine, native UI, dynamic prompts and author Regex');

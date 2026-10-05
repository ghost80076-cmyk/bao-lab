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

assert.match(card.content.system_prompt,/作品名稱.*不是 NPC/);
assert.match(card.content.system_prompt,/生存沙盒/);
assert.match(card.content.system_prompt,/預設不擲骰/);
assert.match(card.content.system_prompt,/21\+ 虛構成年人/);
assert.match(card.content.system_prompt,/作品名稱不得進名冊/);
assert.doesNotMatch(card.content.greeting,/hc-collapse|hc-h1|hc-n/);

for(const marker of ['YB:ELZE:OPENING','YB:ELZE:NOTICE']) {
  assert.match(card.content.greeting,new RegExp(marker));
}
assert.doesNotMatch(card.content.greeting,/YB:ELZE:AWAKENING/);
assert.match(card.content.system_prompt,/【開局資料來源】/);
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

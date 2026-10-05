'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/bc/xinglan-academy.json');
const regex=require('../data/characters/community/bc/xinglan-academy.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'xinglan-academy');
assert.equal(card.meta.name,'星瀾學園');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/HOn2ey4.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/作品名稱「星瀾學園」.*不是 NPC/);
assert.match(card.content.system_prompt,/所有主要學生角色皆為 18 歲以上/);
assert.match(card.content.system_prompt,/信任[\s\S]*親近[\s\S]*張力/);
assert.match(card.content.system_prompt,/現代寫實/);
assert.match(card.content.system_prompt,/異能秘聞/);
assert.match(card.content.system_prompt,/修煉學園/);
assert.match(card.content.system_prompt,/多種族共學/);
assert.doesNotMatch(card.content.greeting,/hc-collapse|hc-h1|hc-n/);
assert.doesNotMatch(card.content.system_prompt,/0[–-]500.*好感|400.*獨佔/);

for(const marker of ['YB:XINGLAN:OPENING','YB:XINGLAN:ORIENTATION']){
  assert.match(card.content.greeting,new RegExp(marker));
}
assert.doesNotMatch(card.content.greeting,/YB:XINGLAN:MODE/);
assert.match(card.content.system_prompt,/【開局落點】/);
assert.match(card.content.system_prompt,/世界模式在開局前已確定/);

assert.equal(card.gameplay.initial_state.npcs.length,8);
assert.ok(card.gameplay.initial_state.npcs.every(x=>Number(x.age)>=18));
assert.deepEqual(
  card.gameplay.initial_state.npcs.map(x=>x.name),
  ['蘇晴雪','林小雨','白羽音','夏星瀾','林宇軒','陳墨','趙天翔','蕭夜']
);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['campus-routine','relationship-shift','multi-npc-scene','message-network','rivalry-jealousy','world-mode-mystery','rumour-information','offscreen-time','campus-event','adult-romance-boundary']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','campus','scene_participants','known_people','relationships','schedule','messages','rumours','known_clues','open_threads','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#9fb3e8');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','people','campus','messages','mystery','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===18));
assert.ok(ui.builder.fields.some(x=>x.key==='background'));
assert.ok(ui.builder.fields.some(x=>x.key==='world_mode'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.every(rule=>!rule.reason));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:XINGLAN:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:XINGLAN:MODE')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:XINGLAN:ORIENTATION')&&rule.rich));

console.log('PASS Xinglan Academy card with adult campus cast, relationship axes, world modes, native UI, builder, dynamic prompts and author Regex');

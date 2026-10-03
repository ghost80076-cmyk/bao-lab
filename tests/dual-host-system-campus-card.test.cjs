'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/17/dual-host-system-campus.json');
const regex=require('../data/characters/community/17/dual-host-system-campus.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'dual-host-system-campus');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/4zlZAMj.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/玩家扮演【系統】/);
assert.match(card.content.system_prompt,/宿主自主/);
assert.match(card.content.system_prompt,/許若棠.*不是宿主/);
assert.match(card.content.system_prompt,/互不知曉/);
assert.match(card.content.system_prompt,/作品名稱不是 NPC/);
assert.doesNotMatch(card.content.greeting,/hc-btn|<input|<details|onclick/);

for(const marker of ['YB:DUAL:OPENING','YB:DUAL:LINK','YB:DUAL:ACTIONS']) {
  assert.match(card.content.greeting,new RegExp(marker));
}

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['system-definition','npc-preset-load','task-issue','host-conflict','dual-secrecy','ntl-ntr-tension','ruotang-agency','campus-life','time-skip','system-reward','offscreen-life','custom-world']) {
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['system','scene','host_a','host_b','focus_npc','relationships','tasks','consequences','known_people','event_log']) {
  assert.ok(moduleIds.has(id),'missing '+id);
}

assert.ok(!Object.prototype.hasOwnProperty.call(card.gameplay.initial_state.character_statuses,card.meta.name));
assert.ok(card.gameplay.initial_state.npcs.every(x=>x.name!==card.meta.name && x.name!==card.meta.title));

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.ok(ui.builder.fields.some(x=>x.key==='world_preset'));
assert.ok(ui.builder.fields.some(x=>x.key==='binding_mode'&&x.default==='雙宿主｜互不知曉'));
assert.ok(ui.builder.fields.some(x=>x.key==='system_type'));
assert.ok(ui.builder.fields.some(x=>x.key==='npc_preset'&&x.default==='不載入｜我自己設定'));
assert.equal(card.gameplay.initial_state.npcs.length,0);
assert.equal(card.gameplay.initial_state.modules.system.system_type,'未定義｜由玩家決定');
assert.deepEqual(ui.panels.map(x=>x.id),['links','hostA','hostB','focus','relations','tasks','actions']);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,4);
assert.deepEqual(card.import_metadata.preserved_source,regex);

const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,4);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:DUAL:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:DUAL:LINK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:DUAL:TASK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:DUAL:ALERT')&&rule.rich));

console.log('PASS dual host system campus card with native UI, dynamic prompts and author Regex');

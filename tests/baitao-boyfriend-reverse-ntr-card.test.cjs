const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const card = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'characters', 'community', '1f', 'baitao-boyfriend-reverse-ntr.json'),
  'utf8'
));

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'baitao-boyfriend-reverse-ntr');
assert.equal(card.meta.category, 'male');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'female');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/CGohh6w.jpg');
assert.ok(card.meta.tags.includes('逆NTR'));
assert.ok(card.meta.tags.includes('監視線索'));

assert.equal(card.gameplay.character_status.primary_character_name, '白桃奶昔');
assert.match(card.content.system_prompt, /【證據可見性】/);
assert.match(card.content.system_prompt, /綠帽題材可以成立，但不是單線腳本/);
assert.match(card.content.system_prompt, /只有當既定設定／既有玩家資料明確設定監視器存在時/);
assert.match(card.content.system_prompt, /玩家是否因被綠而興奮、痛苦、麻木或矛盾/);
assert.match(card.content.system_prompt, /陳浩.*不是擁有.*必勝數值/s);
assert.match(card.content.system_prompt, /蘇晴是不是玩家的幫手.*不是固定真相/s);
assert.match(card.content.system_prompt, /證據鏈/);

const dynamicIds = card.content.dynamic_prompts.map((item) => item.id);
for (const id of [
  'baitao-reverse-ntr-evidence',
  'baitao-surveillance',
  'baitao-rival-pressure',
  'baitao-confrontation',
  'baitao-suqing-ambiguity',
  'baitao-mizuki-counterpull',
  'baitao-live-public',
  'baitao-adult-intimacy',
  'baitao-time-skip'
]) assert.ok(dynamicIds.includes(id), id);

const moduleIds = card.gameplay.world_modules.map((item) => item.id);
for (const id of [
  'scene','player','baitao','chenhao','support_cast','relationship_web',
  'evidence','secrets','scene_participants','known_people','open_threads','recent_events'
]) assert.ok(moduleIds.includes(id), id);

const npcNames = card.gameplay.initial_state.npcs.map((npc) => npc.name);
assert.deepEqual(npcNames, ['白桃奶昔', '陳浩', '蘇晴', '星野美月']);
assert.ok(!npcNames.includes(card.meta.name));
assert.ok(!npcNames.includes(card.meta.title));

const knownPeople = card.gameplay.initial_state.modules.known_people.join('\n');
assert.ok(!knownPeople.includes(card.meta.name));
assert.ok(!knownPeople.includes(card.meta.title));

const panelIds = card.gameplay.ui_schema.panels.map((panel) => panel.id);
assert.deepEqual(panelIds, ['now','people','relations','evidence','secrets','actions']);

const builder = card.gameplay.ui_schema.builder.fields;
assert.ok(builder.some((field) => field.key === 'cuckold_stance'));
assert.ok(builder.some((field) => field.key === 'surveillance_setting'));
assert.ok(builder.some((field) => field.key === 'night_account'));
assert.ok(builder.some((field) => field.key === 'mizuki_relation'));
assert.ok(builder.some((field) => field.key === 'suqing_link'));

assert.doesNotMatch(card.content.greeting, /<hc-card|<hc-collapse|<!--/i);
assert.ok(card.presentation.opening.choices.length >= 5);
assert.equal(card.presentation.play_info_surface, 'game-ui');

console.log('baitao boyfriend reverse NTR card tests passed');

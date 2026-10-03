'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/45/lin-yuyan-possessed-husband.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'lin-yuyan-possessed-husband');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'female');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/O1NWbgz.jpg');
assert.equal(card.presentation.reading_background,'https://i.meee.com.tw/O1NWbgz.jpg');
assert.equal(card.presentation.play_info_surface,'game-ui');
assert.equal(card.gameplay.character_status.primary_character_name,'林語嫣');
assert.match(card.content.system_prompt,/只有玩家確定自己不是原本的陳俊傑/);
assert.match(card.content.system_prompt,/過去被迫配合.*不能被解讀成同意/);
assert.match(card.content.system_prompt,/故事開場時，小米 7 歲/);
assert.match(card.content.system_prompt,/快進 13 年.*約 20 歲/);
assert.match(card.content.system_prompt,/未滿 18 歲.*不得進入成人／性化內容/);
assert.doesNotMatch(card.content.greeting,/📊 狀態欄|你觀察到的可能情緒|<hc-collapse|<p class=/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['identity-discontinuity','yuyan-trust','xiaomi-safety','public-mask','debt-pressure','roleplay-trigger','reconnect-world','possession-truth','adult-intimacy','time-skip-aging']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','yuyan','xiaomi','household','public_mask','debt','relationship']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.deepEqual(ui.panels.map(x=>x.id),['now','yuyan','home','mask','relationship']);
assert.equal(card.gameplay.initial_state.modules.xiaomi.age,7);
const xiaomiAgeField=card.gameplay.world_modules.find(x=>x.id==='xiaomi').fields.find(x=>x.key==='age');
assert.ok(xiaomiAgeField.max>7,'xiaomi age must be able to advance with story time');
assert.equal(card.gameplay.initial_state.modules.debt.amount,'約 200 萬');
assert.ok(card.presentation.opening.choices.some(x=>x.includes('小米')));
assert.ok(card.presentation.opening.choices.some(x=>x.includes('觀察')));
console.log('PASS lin-yuyan possessed-husband adult male psychological-drama card');

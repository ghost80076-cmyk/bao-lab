const assert = require('node:assert/strict');
const core = require('../js/character-studio-creation-map-core.js');

const empty = core.derive({});
assert.equal(empty.structuredWorld, false);
assert.equal(empty.areas.people.label, '尚未補充人物資料');
assert.equal(empty.areas.world.label, '尚未補充世界資料');
assert.equal(empty.areas.status.label, '尚未設定人物數值');
assert.equal(empty.areas.ui.label, '沿用夜灣原生閱讀介面');

const configured = core.derive({
  name: '雨港旅店',
  worldMode: true,
  profile: '旅店是作品主體。',
  world: '雨港終年多雨。',
  lore: '【世界書：港區｜港區】',
  npcs: [{name:'林曼'}, {name:'蘇晴'}],
  statusFields: [{key:'affinity'}, {key:'trust'}],
  statusSubjects: {林曼:{affinity:10}, 蘇晴:{trust:20}},
  phoneEnabled: true,
  dialogueEnabled: true,
  gameplayEnabled: true
});
assert.equal(configured.structuredWorld, true);
assert.equal(configured.areas.people.label, '主要角色已設定 · 2 位初始 NPC');
assert.equal(configured.areas.world.label, '世界規則 ＋ 背景／按需世界書');
assert.equal(configured.areas.status.label, '2 個欄位 · 2 位人物初始值');
assert.equal(configured.areas.status.tone, 'good');
assert.equal(configured.areas.ui.label, '手機 · 頭像對話 · 互動面板');

const preserved = core.derive({
  name: '單角色',
  worldMode: false,
  statusFields: [{key:'affinity'}],
  statusSubjects: {'單角色':{affinity:0}, '舊人物':{affinity:20}}
});
assert.equal(preserved.areas.status.tone, 'warn');
assert.equal(preserved.counts.detachedSubjects, 1);
assert.match(preserved.areas.status.detail, /資料會保留/);

console.log('character studio P3 creation map core: OK');

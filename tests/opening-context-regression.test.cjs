'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pathMod=require('node:path');
const fs=require('node:fs');
const pathMod=require('node:path');

const cards={
  weird:require('../data/characters/community/8f/weird-task-system.json'),
  academy:require('../data/characters/community/da/desire-academy-city.json'),
  contract:require('../data/characters/community/8f/heart-contract-custom-lover.json'),
  aetheria:require('../data/characters/community/ae/aetheria-three-factions.json'),
  sakura:require('../data/characters/community/64/sakura-house-experience-management.json'),
  collar:require('../data/characters/community/d6/collar-class-f-to-s.json'),
  jingchen:require('../data/characters/community/a9/lu-jingchen-cold-shell-desire.json'),
  roommate:require('../data/characters/community/1f/baitao-roommate-triangle.json'),
  qiaorou:require('../data/characters/community/c4/lin-qiaorou-always-nearby.json'),
  reborn:require('../data/characters/community/64/reborn-di-daughter-regent.json'),
  baitao:require('../data/characters/community/1f/baitao-boyfriend-reverse-ntr.json'),
  seoyeon:require('../data/characters/community/5d/han-seoyeon-seven-day-contract-lover.json'),
  abo:require('../data/characters/community/94/pheromone-bond-abo-simulator.json'),
  nangong:require('../data/characters/community/22/nangong-wen-runaway-bride.json'),
  heartPlan:require('../data/characters/community/b8/heart-training-boyfriend-plan.json')
};

const characterEngine=fs.readFileSync(pathMod.join(__dirname,'..','js','character.js'),'utf8');
assert.match(characterEngine,/玩家資料、開局選項與結構化初始狀態若已提供/,'platform missing opening handoff contract');
assert.match(characterEngine,/不得要求玩家重新填寫、重新選擇或重演建立流程/,'platform missing no-rebuild contract');

assert.doesNotMatch(cards.weird.content.greeting,/Builder|預設為 22 歲大學生、獨居套房/);
assert.doesNotMatch(cards.academy.content.greeting,/通行證還是空白|先決定今晚要演誰|你可以是新入學/);
assert.doesNotMatch(cards.contract.content.greeting,/設定面板|Persona|先告訴我們，妳需要一個怎樣的戀人/);
assert.doesNotMatch(cards.aetheria.content.greeting,/你剛抵達中立之港|直接說明你想成為什麼樣的人/);
assert.doesNotMatch(cards.sakura.content.greeting,/第一次來？/);
assert.doesNotMatch(cards.collar.content.greeting,/NT\$45,000|你往捷運站方向走了三百公尺/);
assert.doesNotMatch(cards.jingchen.content.greeting,/「新來的？」/);
assert.doesNotMatch(cards.roommate.content.greeting,/大學時的朋友|不知道要怎麼叫你/);
assert.match(cards.qiaorou.content.system_prompt,/最近有點疏遠/);

for(const key of ['contract','jingchen','roommate','qiaorou','reborn','baitao','seoyeon','abo','nangong','heartPlan']){
  const opening=JSON.stringify(cards[key].presentation?.opening||{});
  assert.doesNotMatch(opening,/Builder|Persona|Gameplay UI/,key+' presentation leaked platform setup language');
}

const characterEngine=fs.readFileSync(pathMod.join(__dirname,'..','js','character.js'),'utf8');
assert.match(characterEngine,/玩家資料、開局選項與結構化初始狀態若已提供/);
assert.match(characterEngine,/不得要求玩家重新填寫、重新選擇或重演建立流程/);

console.log('PASS opening-context regression with platform-global setup continuity');

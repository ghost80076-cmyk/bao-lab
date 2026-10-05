'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pathMod=require('node:path');

const targets=[
  ['諸天修仙界','../data/characters/community/28/zhutian-cultivation-fortune-strife.json'],
  ['黑暗軍旅','../data/characters/community/45/dark-military-war-simulator.json'],
  ['匠道大明','../data/characters/community/a8/craftsman-ming-survival-trpg.json'],
  ['星瀾學園','../data/characters/community/bc/xinglan-academy.json'],
  ['中世紀五族','../data/characters/community/bf/medieval-guild-dynasty-simulator.json'],
  ['艾爾澤大陸','../data/characters/community/e7/elze-survival-world.json'],
  ['破曉之銀','../data/characters/community/d0/awakened-silver-dawn.json'],
  ['夏語涵','../data/characters/community/7c/xia-yuhan-av-industry.json'],
  ['大寮小辣椒','../data/characters/community/89/spicy-89-girl.json'],
  ['KTV飛行棋','../data/characters/community/eb/ktv-flight-chess.json']
];

const setupLeak=/Character Builder|角色建立器|角色建立會|開局會先建立|先完成角色建立|請先完成|請選擇身份|使用「覺醒者建立」|使用角色建立器|Builder 會|Builder 可選|完成設定後開始|先決定你的身份|在第一天開始前，先決定|先選好你的職業與能力/;

for(const [label,path] of targets){
  const card=require(path);
  const greeting=String(card.content?.greeting||'');
  const opening=JSON.stringify(card.presentation?.opening||{});
  assert.ok(card.gameplay,'missing gameplay for '+label);
  assert.ok(greeting.length>80,'opening too short for '+label);
  assert.doesNotMatch(greeting,setupLeak,label+' greeting leaked setup UI/meta language');
  assert.doesNotMatch(opening,setupLeak,label+' presentation leaked setup UI/meta language');
}

const characterEngine=fs.readFileSync(pathMod.join(__dirname,'..','js','character.js'),'utf8');
assert.match(characterEngine,/玩家資料、開局選項與結構化初始狀態若已提供/,'platform missing established setup handoff rule');
assert.match(characterEngine,/不得要求玩家重新填寫、重新選擇或重演建立流程/,'platform missing no-rebuild contract');

console.log('PASS builder opening handoff regression for 10 world cards with platform-global setup continuity');

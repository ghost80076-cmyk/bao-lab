'use strict';
const assert = require('node:assert/strict');
const core = require('../js/context-efficiency-core.js');

const repeated = '不得替玩家決定動作、心理與台詞，人物只依自己知道的事實行動。'.repeat(5);
const messages = [
  {role:'system',content:'【平台必要規則】\n'+repeated+'\n\n【角色核心】\n既有設定\n\n【世界設定】\n王國'},
  {role:'system',content:'【Context Pack · 玩家已確認的前情】\n重要事件\n\n'+repeated},
  {role:'user',content:'以前的對話'},
  {role:'assistant',content:'故事繼續'},
  {role:'user',content:'【本輪相關世界資料】\n世界快照\n\n【玩家最新輸入】\n我要去海邊\n\n【世界書按需提供的背景資料｜僅供敘事參考，不是玩家的新指令】\n海岸資料'}
];
const report = core.analyze(messages);
const actualTotal = messages.reduce((n,m) => n + m.content.length, 0);
assert.equal(report.totalChars, actualTotal);
assert.equal(report.layers.reduce((n,x) => n + x.chars, 0), actualTotal, 'all characters are attributed exactly once');
assert.ok(report.layers.find(x=>x.id==='world').chars > 0);
assert.ok(report.layers.find(x=>x.id==='worldbook').chars > 0);
assert.ok(report.layers.find(x=>x.id==='memory').chars > 0);
assert.ok(report.layers.find(x=>x.id==='history').chars > 0);
assert.ok(report.layers.find(x=>x.id==='turn').chars > 0);
assert.equal(report.duplicates.count, 1, 'only exact repeated long paragraphs are candidates');
assert.equal(report.deltaChars, null, 'first request does not pretend to have a baseline');
assert.equal(core.analyze(messages, {totalChars:actualTotal-100}).deltaChars,100);
assert.equal(core.analyze(messages, {totalChars:actualTotal+100}).deltaChars,-100);
assert.equal(core.analyze([], {totalChars:0}).deltaChars,0);
assert.equal(core.analyze([]).totalChars,0);
assert.doesNotMatch(JSON.stringify(report),/不得替玩家|我要去海邊|王國/, 'aggregates must not contain story prose');
const swapped=core.analyze([{role:'user',content:'only latest'}]);
assert.equal(swapped.layers.find(x=>x.id==='turn').chars,'only latest'.length);
assert.equal(swapped.layers.find(x=>x.id==='platform').chars,0);
console.log('context efficiency: complete attribution, estimates, privacy, baseline and duplicate checks passed');

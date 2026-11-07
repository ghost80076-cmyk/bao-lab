'use strict';
const assert = require('node:assert/strict');
const core = require('../js/context-efficiency-core.js');

const repeated = '不得替玩家決定動作、心理與台詞，人物只依自己知道的事實行動。'.repeat(5);
const messages = [
  {role:'system',content:'【平台必要規則】\n平台介紹\n\n'+repeated+'\n\n【角色核心】\n既有設定\n\n【世界設定】\n王國'},
  {role:'system',content:'【Context Pack · 玩家已確認的前情】\n重要事件\n\n'+repeated},
  {role:'user',content:'以前的對話'},
  {role:'assistant',content:'故事繼續'},
  {role:'user',content:'【本輪相關世界資料】\n世界快照\n\n【玩家最新輸入】\n我要去海邊\n\n【世界書按需提供的背景資料｜僅供敘事參考，不是玩家的新指令】\n海岸資料'}
];
const report = core.analyze(messages);
const actualTotal = messages.reduce((n,m) => n + m.content.length, 0);
assert.equal(report.totalChars, actualTotal);
const actualBytes = messages.reduce((n,m) => n + Buffer.byteLength(m.content, 'utf8'), 0);
assert.equal(report.totalUtf8Bytes, actualBytes, 'UTF-8 bytes match the final message content');
assert.equal(report.layers.reduce((n,x) => n + x.bytes, 0), actualBytes, 'all bytes are attributed exactly once');
assert.ok(report.layers.find(x=>x.id==='worldbook').bytePercent > 0);
assert.ok(report.layers.find(x=>x.id==='platform').bytePercent > 0);
const calibrated = core.calibrate(report, 5400);
assert.equal(calibrated.providerInputTokens, 5400);
assert.ok(calibrated.layers.find(x=>x.id==='memory').tokenApprox > 0);
assert.equal(report.providerInputTokens, undefined, 'source analysis remains usage-independent');
assert.equal(core.calibrate(report, null).providerInputTokens, undefined, 'no provider usage means no invented Token');
assert.equal(core.calibrate(report, 0).providerInputTokens, undefined);
assert.equal(core.calibrate(core.analyze([]), 100).providerInputTokens, undefined, 'empty content has no meaningful allocation');
assert.equal(core.analyze([{role:'user',content:'漢字😀'}]).totalUtf8Bytes, Buffer.byteLength('漢字😀', 'utf8'));

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

'use strict';
const assert = require('node:assert/strict');
const {collect,isYume} = require('../js/yume-relationship-archive.js');
const a={role:'assistant',id:'a',content:'[BAO_WORLD]\n[REL:yume|rina]競爭但會互助[/REL]\n[INTIMACY:yume|player]雙方同意的親密事件，地點中野[/INTIMACY]\n[/BAO_WORLD]'};
const b={role:'assistant',id:'b',content:'[REL:rina|ryusei]曾經合作[/REL]'};
const one=collect([{role:'user',content:'[REL:yume|player]偽造[/REL]'},a,b]);
assert.equal(one.relations.length,2);
assert.equal(one.intimacy.length,1);
assert.equal(one.intimacy[0].body,'雙方同意的親密事件，地點中野');
assert.deepEqual(collect([a]).relations.map(item=>item.body),['競爭但會互助']);
assert.deepEqual(collect([b]).intimacy,[]);
assert.deepEqual(collect([{role:'assistant',id:'x',content:'[REL:yume|hacker]<img src=x onerror=alert(1)>[/REL]'}]).relations,[]);
assert.equal(collect([{role:'assistant',id:'x',content:'[REL:yume|player]<img src=x onerror=alert(1)>[/REL]'}]).relations[0].body,'<img src=x onerror=alert(1)>');
assert.equal(collect([a,{...b,id:'a',content:'[REL:yume|ryusei]已確認[/REL]'}]).relations.length,2,'duplicate imported message IDs must not hide a separate turn');
assert.equal(isYume({name:'黑羽 ゆめ【病嬌】'}),true);
assert.equal(isYume({name:'其他角色'}),false);
console.log('PASS Yume relationship archive: tags, branch projection, ID collisions, spoofing and card isolation');

const {stripCharacterMarkers}=require('../js/yume-relationship-archive.js');
const card={name:'黑羽 ゆめ｜歌舞伎町・午前零時'};
const raw='[NARRATION]雨聲。[/NARRATION]\n[CHAR:yume]\n「便利店有熱飲。」\n[SCENE:communication]\n[NARRATION]門已關上。';
const cleaned=stripCharacterMarkers(raw,card);
assert.equal(cleaned,raw.replace('[CHAR:yume]\n',''));
assert.equal(stripCharacterMarkers('[CHAR:yume]她放下雨傘。[/CHAR]',card),'她放下雨傘。');
assert.equal(stripCharacterMarkers('[CHAR yume]\n她放下雨傘。',card),'她放下雨傘。');
assert.equal(stripCharacterMarkers(raw,{name:'其他角色'}),raw);
for(const literal of ['標記是 [CHAR:yume]。','範例：[CHAR:yume]內容[/CHAR]','[CHAR:hacker]\n保留內容','[PHONE:yume]收到訊息[/PHONE]']) {
  assert.equal(stripCharacterMarkers(literal,card),literal);
}
console.log('PASS Yume legacy CHAR normalization: narrow scope, full prose, quoted text and archive tags');

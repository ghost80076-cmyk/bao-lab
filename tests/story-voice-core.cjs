const assert=require('node:assert/strict');
const C=require('../js/story-voice-core.js');
assert.deepEqual(C.profile({language:'ja-JP',rate:99,pitch:0,volume:0,key:'secret'}),{language:'ja-JP',voiceURI:'',rate:1.5,pitch:.5,volume:0});
assert.notEqual(C.profileKey('work','a'),C.profileKey('work','b'));
const voices=[{voiceURI:'zh',lang:'zh-TW',localService:true},{voiceURI:'ja-remote',lang:'ja-JP',localService:false},{voiceURI:'ja',lang:'ja-JP',localService:true},{voiceURI:'ko',lang:'ko-KR',localService:true}];
assert.equal(C.selectVoice(voices,C.profile({language:'ja-JP'})).voiceURI,'ja');
assert.equal(C.selectVoice(voices,C.profile({language:'ko-KR'})).voiceURI,'ko');
assert.equal(C.selectVoice(voices,C.profile({language:'en-US'})),null);
assert.equal(C.selectVoice(voices,C.profile({language:'ja-JP',voiceURI:'ko'})),null);
assert.equal(C.selectVoice(voices,C.profile({language:'ja-JP',voiceURI:'ja-remote'})).voiceURI,'ja-remote');
assert.equal(C.selectVoice(voices.filter(v=>!v.localService),C.profile({language:'ja-JP'})),null);
assert.deepEqual(C.candidates('他走到窗邊。「晚安。」她想著『明天』。'),['晚安。','明天']);
assert.deepEqual(C.candidates('<div>「不能自動解析 HTML」</div>'),[]);
assert.deepEqual(C.candidates('只有旁白。'),[]);
assert.throws(()=>C.script(''));assert.throws(()=>C.script('a'.repeat(1201)));
assert.equal(C.script(' おやすみ。 '),'おやすみ。');
assert.equal(C.mergeDraft('原有文字','新增文字'),'原有文字\n新增文字');
assert.throws(()=>C.mergeDraft('a','b',2));
assert.equal(C.finalTranscript([{isFinal:false,0:{transcript:'未確認'}},{isFinal:true,0:{transcript:'晚安'}}]),'晚安');
console.log('Voice core: language, local-only default, fixed profiles, manual candidates, draft preservation passed');

const exported=C.exportPack({language:'ko-KR',voiceURI:'ko',rate:.9,pitch:1.15,volume:.7,key:'DO-NOT-EXPORT'});
assert.deepEqual(C.importPack(exported),{language:'ko-KR',voiceURI:'ko',rate:.9,pitch:1.15,volume:.7});
assert(!exported.includes('DO-NOT-EXPORT'));
const good=JSON.parse(exported);
for(const bad of [{...good,version:2},{...good,engine:'remote'},{...good,url:'https://example.invalid'},{...good,profile:{...good.profile,apiKey:'secret'}},{...good,profile:{...good.profile,rate:99}},{...good,profile:{...good.profile,language:'bad'}},{...good,profile:{...good.profile,voiceURI:'\nfoo'}},{...good,profile:{...good.profile,volume:'1'}},[]]){
 assert.throws(()=>C.importPack(JSON.stringify(bad)));
}
assert.throws(()=>C.importPack('x'.repeat(C.PACK_LIMIT+1)));
assert.throws(()=>C.importPack('not JSON'));
assert.throws(()=>C.importPack('{"schema":"yorubay.voice-profile","version":1,"engine":"web-speech","profile":{"language":"ko-KR","voiceURI":"ko","rate":1,"pitch":1,"volume":1,"__proto__":{"unsafe":true}}}'));

const cast=[{id:'a',name:'知晚',aliases:['小晚']},{id:'b',name:'阿青'}];
const speech=(speakerId,text)=>({speakerId,text});
const solo=text=>C.directDialogue(text,cast.slice(0,1),'a','旅人');
const group=text=>C.directDialogue(text,cast,null,'旅人');
assert.deepEqual(solo('她心想：「他大概還沒吃。」她把菜單推到你面前。「要不要一起點？」'),[speech('a','要不要一起點？')]);
assert.deepEqual(solo('她放下杯子。「你吃過了嗎？」她把菜單推近了些。「我想點這個。」'),[speech('a','你吃過了嗎？'),speech('a','我想點這個。')]);
assert.deepEqual(solo('她看見門上貼著「今日公休」，把傘收了起來。'),[]);
assert.deepEqual(solo('「沒帶傘。」她心想。\n旅人：「我有。」\n路人說：「借你。」\n她開口問：「真的？」'),[speech('a','真的？')]);
assert.deepEqual(group('小晚問：「晚餐呢？」\n「沒吃。」阿青答。\n「猜猜我是誰。」\n旅人：「是我。」'),[speech('a','晚餐呢？'),speech('b','沒吃。')]);
assert.deepEqual(solo('她心想：\n「快下雨了。」\n她說：\n「走吧。」'),[speech('a','走吧。')]);
assert.deepEqual(solo('「有空嗎？」[STATUS]「隱藏」[/STATUS][CHOICE]「選我」[/CHOICE]'),[speech('a','有空嗎？')]);
assert.deepEqual(solo('「一」[STATUS]「未關閉」'),[speech('a','一')]);
assert.deepEqual(solo('<div hidden>「隱藏」</div>'),[]);
assert.deepEqual(solo('「未完\n[TOOL]「隱藏」'),[]);
assert.deepEqual(C.directDialogue('知晚：「你好。」',[...cast,{id:'c',name:'知晚'}],null),[]);
assert.deepEqual(group('阿青說：「第一句。」「第二句。」'),[speech('b','第一句。'),speech('b','第二句。')]);

 // Existing RP cards often put a complete italic action before direct speech.
assert.deepEqual(solo('*她微笑著*「晚安。」'),[speech('a','晚安。')]);
assert.deepEqual(solo('*她放下杯子。*\n「要一起吃嗎？」'),[speech('a','要一起吃嗎？')]);
assert.deepEqual(solo('*知晚低頭微笑*\n「晚安。」'),[speech('a','晚安。')]);
assert.deepEqual(solo('*她心想：*「不要說出口。」'),[]);
assert.deepEqual(solo('*她看見門上寫著*「公休。」'),[]);
assert.deepEqual(solo('*路人說：*「借過。」'),[]);
assert.deepEqual(group('*她微笑著*「不知道誰在說話。」'),[]);

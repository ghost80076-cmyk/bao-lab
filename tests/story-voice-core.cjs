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

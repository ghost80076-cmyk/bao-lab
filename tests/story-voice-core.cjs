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

async function testSTT(){
 const cfg={endpoint:'https://stt.example.invalid/v1/audio/transcriptions',model:'player-model',key:'STT-ONLY',language:'zh-TW'};
 assert.equal(C.sttConfig(cfg).language,'zh');
 assert.equal(C.sttConfig({...cfg,endpoint:'http://127.0.0.1:8080/v1/audio/transcriptions',key:''}).key,'');
 for(const endpoint of ['http://example.com/v1/audio/transcriptions','https://user:pass@example.com/audio/transcriptions','https://example.com/audio/transcriptions?key=123','https://example.com/audio/transcriptions#x','javascript:alert(1)','https://example.com/v1/chat/completions'])assert.throws(()=>C.sttConfig({...cfg,endpoint}));
 assert.throws(()=>C.sttConfig({...cfg,model:''}));
 const blob=new Blob(['fixture'],{type:'audio/webm;codecs=opus'});
 let requests=0;
 const fetcher=async(url,opts)=>{
   requests++;assert.equal(url,cfg.endpoint);assert.equal(opts.method,'POST');assert.equal(opts.headers.Authorization,'Bearer STT-ONLY');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(opts.referrerPolicy,'no-referrer');
   assert.equal(opts.body.get('model'),'player-model');assert.equal(opts.body.get('language'),'zh');assert.equal(await opts.body.get('file').text(),'fixture');
   assert.deepEqual([...opts.body.keys()],['file','model','language']);
   return new Response(JSON.stringify({text:'繁體中文測試'}));
 };
 assert.equal(await C.transcribe(cfg,blob,{fetcher}),'繁體中文測試');assert.equal(requests,1);
 await assert.rejects(C.transcribe(cfg,new Blob([],{type:'audio/webm'}),{fetcher}),/格式/);
 await assert.rejects(C.transcribe(cfg,new Blob(['x'],{type:'text/plain'}),{fetcher}),/格式/);
 await assert.rejects(C.transcribe(cfg,new Blob([new Uint8Array(C.STT_MAX_BYTES+1)],{type:'audio/webm'}),{fetcher}),/格式/);
 assert.equal(requests,1);
 await assert.rejects(C.transcribe(cfg,blob,{fetcher:async()=>new Response('secret error',{status:401})}),/回應失敗/);
 await assert.rejects(C.transcribe(cfg,blob,{fetcher:async()=>new Response('x'.repeat(131073))}),/超過限制/);
 await assert.rejects(C.transcribe(cfg,blob,{fetcher:async()=>new Response('{"text":""}')}),/有效文字/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(C.transcribe(cfg,blob,{signal:controller.signal,fetcher:async(_,opts)=>{assert.equal(opts.signal,controller.signal);throw Error('aborted');}}),/aborted/);
 console.log('Custom STT: explicit endpoint, separated key, bounded audio and response, no redirect, editable text contract passed.');
}
testSTT().catch(e=>{console.error(e);process.exitCode=1;});

async function testTTS(){
 const cfg={endpoint:'https://tts.example.invalid/v1/audio/speech',model:'player-tts',voice:'role-voice',key:'TTS-ONLY',speed:1.15};
 assert.equal(C.ttsConfig(cfg).voice,'role-voice');
 assert.equal(C.ttsConfig({...cfg,endpoint:'http://localhost:8080/v1/audio/speech',key:''}).key,'');
 for(const endpoint of ['http://example.com/audio/speech','https://user:pass@example.com/audio/speech','https://example.com/audio/speech?key=123','https://example.com/audio/transcriptions'])assert.throws(()=>C.ttsConfig({...cfg,endpoint}));
 assert.throws(()=>C.ttsConfig({...cfg,voice:''}));
 const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);
 let requests=0;
 const fetcher=async(url,opts)=>{
   requests++;assert.equal(url,cfg.endpoint);assert.equal(opts.method,'POST');assert.equal(opts.headers.Authorization,'Bearer TTS-ONLY');
   assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(opts.referrerPolicy,'no-referrer');
   assert.deepEqual(JSON.parse(opts.body),{model:'player-tts',voice:'role-voice',input:'晚安。',speed:1.15,response_format:'mp3'});
   return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
 };
 const result=await C.synthesize(cfg,' 晚安。 ',{fetcher});
 assert.equal(result.type,'audio/mpeg');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);assert.equal(requests,1);
 await assert.rejects(C.synthesize(cfg,'',{fetcher}));assert.equal(requests,1);
 await assert.rejects(C.synthesize(cfg,'晚安。',{fetcher:async()=>new Response('private provider error',{status:401})}),/回應失敗/);
 await assert.rejects(C.synthesize(cfg,'晚安。',{fetcher:async()=>new Response('<html>bad</html>',{headers:{'Content-Type':'text/html'}})}),/相容音訊/);
 await assert.rejects(C.synthesize(cfg,'晚安。',{fetcher:async()=>new Response('not audio',{headers:{'Content-Type':'audio/mpeg'}})}),/格式不相容/);
 await assert.rejects(C.synthesize(cfg,'晚安。',{fetcher:async()=>new Response(new Uint8Array(C.TTS_MAX_BYTES+1),{headers:{'Content-Type':'audio/mpeg'}})}),/16 MiB/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(C.synthesize(cfg,'晚安。',{signal:controller.signal,fetcher:async(_,opts)=>{assert.equal(opts.signal,controller.signal);throw Error('aborted');}}),/aborted/);
 console.log('Custom TTS: explicit one-shot request, isolated key, bounded response and audio format checks passed.');
}
testTTS().catch(e=>{console.error(e);process.exitCode=1;});

const autoBudget=C.autoTTSBudget();
assert.deepEqual(autoBudget.remaining(),{requests:20,characters:6000});
for(let i=0;i<20;i++)assert.equal(autoBudget.reserve('晚安。'),true);
assert.equal(autoBudget.reserve('再見。'),false);
assert.deepEqual(autoBudget.remaining(),{requests:0,characters:5940});
const characterBudget=C.autoTTSBudget();
for(let i=0;i<5;i++)assert.equal(characterBudget.reserve('字'.repeat(1200)),true);
assert.equal(characterBudget.reserve('字'),false);
assert.deepEqual(characterBudget.remaining(),{requests:15,characters:0});
assert.throws(()=>characterBudget.reserve(''));
console.log('Automatic TTS grant: separate request and character limits, no implicit reset.');

async function testLocalAudioDraft(){
 const wav=new Uint8Array(44);wav.set(Buffer.from('RIFF'),0);wav.set(Buffer.from('WAVE'),8);
 const audio=await C.localAudioDraft(new Blob([wav],{type:'audio/x-wav'}));
 assert.equal(audio.blob.type,'audio/wav');assert.equal(audio.extension,'wav');
 assert.deepEqual(new Uint8Array(await audio.blob.arrayBuffer()),wav);
 await assert.rejects(C.localAudioDraft(new Blob([wav],{type:'text/html'})),/格式/);
 await assert.rejects(C.localAudioDraft(new Blob(['<html>not audio</html>'],{type:'audio/wav'})),/格式/);
 await assert.rejects(C.localAudioDraft(new Blob([])),/8 MiB/);
 await assert.rejects(C.localAudioDraft(new Blob([new Uint8Array(C.AUDIO_DRAFT_MAX_BYTES+1)])),/8 MiB/);
 const mp4=await C.localAudioDraft(new Blob([Buffer.from('\x00\x00\x00\x18ftypM4A ')]));
 assert.equal(mp4.extension,'m4a');
 console.log('Local audio draft: container sniffing, normalized MIME and size ceiling passed.');
}
testLocalAudioDraft().catch(e=>{console.error(e);process.exitCode=1;});

const persistedSTT=C.savedSTT({endpoint:'https://stt.example.invalid/v1/audio/transcriptions',model:'whisper',language:'ja-JP',key:'DO-NOT-SAVE'});
assert.deepEqual(persistedSTT,{endpoint:'https://stt.example.invalid/v1/audio/transcriptions',model:'whisper',language:'ja-JP'});
const persistedTTS=C.savedTTS({endpoint:'http://localhost:8080/v1/audio/speech',model:'tts',speed:1.2,key:'DO-NOT-SAVE'},[['a','va'],['b','vb']]);
assert.deepEqual(persistedTTS,{endpoint:'http://localhost:8080/v1/audio/speech',model:'tts',speed:1.2,voices:[['a','va'],['b','vb']]});
assert.throws(()=>C.savedTTS(persistedTTS,[['a','va'],['a','vb']]));
assert.throws(()=>C.savedTTS(persistedTTS,[]));
assert.throws(()=>C.savedSTT({endpoint:'https://example.invalid/audio/transcriptions?key=secret',model:'x'}));
assert.equal(C.autoTTSLimits('extended').durationMs,7200000);
assert.equal(C.autoTTSLimits('__proto__').requests,20);
const extended=C.autoTTSBudget('extended');
for(let n=0;n<100;n++)assert.equal(extended.reserve('hi'),true);
assert.equal(extended.reserve('hi'),false);
assert.deepEqual(C.autoTTSBudget('long').remaining(),{requests:300,characters:90000});

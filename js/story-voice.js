/* Explicit opt-in voice tools. Device or explicitly authorized chapter-only custom TTS. */
(()=>{
 'use strict';
 const Core=window.BAOStoryVoiceCore;
 if(!Core||typeof App==='undefined'||typeof Chat==='undefined'||window.BAOStoryVoice)return;
 const STORE='yorubay-device-voice-v1',CUSTOM_STORE='yorubay-custom-voice-v1';
 function readCustom(){
   try{
     const o=JSON.parse(localStorage.getItem(CUSTOM_STORE)||'{}'),out=Object.create(null);
     if(!o||typeof o!=='object'||Array.isArray(o))return out;
     for(const [id,p] of Object.entries(o).slice(-101)){
       try{if(id==='stt')out[id]=Core.savedSTT(p);else if(id.startsWith('tts:'))out[id]=Core.savedTTS(p,p?.voices);}catch(_){}
     }
     return out;
   }catch(_){return Object.create(null);}
 }
 function writeCustom(id,value){
   const data=readCustom();delete data[id];if(value)data[id]=value;
   const stt=data.stt;delete data.stt;
   localStorage.setItem(CUSTOM_STORE,JSON.stringify({...Object.fromEntries(Object.entries(data).slice(-100)),...(stt?{stt}:{})}));
 }
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.addEventListener('click',fn);return n;};
 const field=(label,tag='select')=>{const wrap=el('label',label),input=el(tag);input.setAttribute('aria-label',label);wrap.append(input);return {wrap,input};};
 const options=(select,rows)=>select.replaceChildren(...rows.map(([v,t])=>{const n=el('option',t);n.value=v;return n;}));
 const languageOptions=[['zh-TW','繁體中文／華語'],['ja-JP','日本語'],['ko-KR','한국어'],['en-US','English']];
 const refs=()=>window.BAOStoryLibrary?.refs?.()||{};
 const scope=()=>({owner:GameState.current,card:App.activeCharacter,...refs()});
 const same=s=>{const n=scope();return !!s.owner&&s.owner===n.owner&&s.card===n.card&&s.storyId===n.storyId&&s.chapterId===n.chapterId;};
 const read=()=>{try{const data=JSON.parse(localStorage.getItem(STORE)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(_){return {};}};
 const save=(id,p)=>{const data=read();delete data[id];data[id]=Core.profile(p);localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(Object.entries(data).slice(-100))));};
 let active=null;
 // A session belongs to this open story/chapter. Only successful story turns
 // enter the queue. Repainting history and reopening a save never enqueue it.
 let automatic=null, sequence=null, notice='', notify=null;
 const tell=t=>{notice=t;notify?.(t);};
 const inStory=()=>!document.hidden&&document.getElementById('chat-view')?.classList.contains('active');
 function releaseRemote(seq){
   seq.controller?.abort();seq.controller=null;
   if(seq.audio){seq.audio.onended=seq.audio.onerror=null;seq.audio.pause();seq.audio.removeAttribute('src');seq.audio.load();seq.audio=null;}
   if(seq.url){URL.revokeObjectURL(seq.url);seq.url=null;}
 }
 function stopSequence(){
   const seq=sequence;
   sequence=null;
   if(!seq)return;
   clearInterval(seq.watch);
   clearTimeout(seq.timeout);releaseRemote(seq);
   if(seq.utterance){
     seq.utterance.onend=seq.utterance.onerror=null;
     window.speechSynthesis?.cancel();
   }
 }
 function disableAutomatic(){
   clearTimeout(automatic?.custom?.expiry);clearInterval(automatic?.custom?.watch);
   automatic=null;
   stopSequence();
   tell('');
 }
 function castFor(current){
   const people=new Map();
   const card=current.card;
   const cardId=String(card.id||card.name);
   const add=(id,name,aliases=[])=>{
     if(id&&name)people.set(String(id),{id:String(id),name,aliases:Array.isArray(aliases)?aliases:[]});
   };
   add(cardId,card.name);
   const cast=Array.isArray(card.dialogue?.cast)?card.dialogue.cast:[];
   const npcs=current.owner.npcs||card.initial_state?.npcs||[];
   for(const n of npcs){
     if(!n?.name)continue;
     const duplicate=npcs.some(other=>other!==n&&other?.name===n.name);
     add(n.id||(duplicate?n.npc_id:n.name),n.name,n.aliases);
   }
   for(const p of cast){
     const matches=[...people.values()].filter(n=>n.name===p.name);
     const id=matches.length===1&&cast.filter(n=>n.name===p.name).length===1?matches[0].id:'author:'+p.id;
     add(id,p.name,[...(people.get(id)?.aliases||[]),...(p.aliases||[])]);
   }
   // The title of a cast-based work is not an extra speaker.
   const actors=[...people.values()].filter(p=>p.id!==cardId);
   const duplicateMain=actors.find(p=>p.name===card.name);
   const speakers=[...people.values()].filter(p=>p.id!==cardId||(!duplicateMain&&(!cast.length||cast.some(n=>n.name===card.name))));
   const solo=App.config?.narrativeMode==='immersive'||!card.supported_modes?.world;
   const defaultId=solo&&speakers.length===1?speakers[0].id:null;
   return {people,speakers,defaultId,cardId};
 }
 function playReply(message){
   stopSequence();
   const session=automatic;
   if(!session||!same(session)||!inStory()||message?.role!=='assistant'||!message.id)return;
   const {speakers,defaultId,cardId}=castFor(session);
   const content=message.content,variant=message.activeVariant||0;
   const visible=window.BAOChatPresentationCore?.stripStatusAppendix?.(content)??content;
   const lines=message.greeting&&session.card.opening?.posts?.length?[]:
     Core.directDialogue(visible,speakers,defaultId,App.config?.persona?.name);
   if(!lines.length){tell('這則回覆沒有可辨識的角色台詞。'+(session.custom?' 自訂配音仍啟用。':''));return;}
   const seq={utterance:null,watch:null,timeout:null,controller:null,audio:null,url:null};
   sequence=seq;
   const synth=window.speechSynthesis;
   const available=synth?.getVoices?.()||[],profiles=read();
   let index=0,skipped=0;
   function current(){
     const latest=Chat.messages.at(-1);
     return automatic===session&&inStory()&&same(session)&&latest?.id===message.id&&latest.content===content&&(latest.activeVariant||0)===variant;
   }
   function remoteFailure(msg){
     if(sequence!==seq||automatic!==session)return;
     disableAutomatic();tell(msg);
   }
   async function remoteLine(text,voice){
     const custom=session.custom;
     if(!custom.budget.reserve(text)){remoteFailure('已達本次自訂配音上限，需重新授權。');return;}
     const remaining=custom.budget.remaining(),controller=new AbortController();seq.controller=controller;
     tell('自訂配音生成中；剩餘 '+remaining.requests+' 次、'+remaining.characters+' 字元。');
     seq.timeout=setTimeout(()=>remoteFailure('自訂配音連線逾時，已停止；不自動重試。'),60000);
     try{
       const blob=await Core.synthesize({...custom.cfg,voice},text,{signal:controller.signal});
       if(sequence!==seq||!current())return;
       clearTimeout(seq.timeout);seq.controller=null;
       seq.url=URL.createObjectURL(blob);const audio=new Audio(seq.url);seq.audio=audio;
       audio.onended=()=>{if(sequence===seq&&seq.audio===audio)next();};
       audio.onerror=()=>remoteFailure('自訂語音無法解碼，已停止。');
       seq.timeout=setTimeout(()=>remoteFailure('自訂配音播放逾時，已停止。'),180000);
       await audio.play();
       if(sequence===seq&&seq.audio===audio&&current())tell('正在播放自訂角色語音；剩餘 '+remaining.requests+' 次、'+remaining.characters+' 字元。');
     }catch(_){remoteFailure('自訂配音失敗或瀏覽器阻擋播放，已停止；請手動確認服務及播放權限。');}
   }
   function next(){
     if(sequence!==seq)return;
     clearTimeout(seq.timeout);releaseRemote(seq);
     seq.utterance=null;
     if(!current()){stopSequence();return;}
     while(index<lines.length){
       const {speakerId,text}=lines[index++];
       if(session.custom){
         const voice=session.custom.voices.get(speakerId);
         if(!voice){skipped++;continue;}
         void remoteLine(text,voice);return;
       }
       const p=Core.profile(profiles[Core.profileKey(cardId,speakerId)]);
       const voice=Core.selectVoice(available,p);
       if(voice?.localService!==true){skipped++;continue;}
       const u=new SpeechSynthesisUtterance(text);
       Object.assign(u,{voice,lang:p.language,rate:p.rate,pitch:p.pitch,volume:p.volume});
       seq.utterance=u;
       u.onend=()=>{if(seq.utterance===u)next();};
       u.onerror=()=>{if(sequence===seq){stopSequence();tell('裝置無法播放這則回覆。');}};
       seq.timeout=setTimeout(()=>{if(sequence===seq){stopSequence();tell('播放已逾時。');}},180000);
       tell('正在播放角色台詞…');
       try{synth.speak(u);}catch(_){stopSequence();tell('裝置無法播放這則回覆。');}
       return;
     }
     stopSequence();
     if(session.custom){
       const left=session.custom.budget.remaining();
       if(!left.requests||!left.characters){disableAutomatic();tell('已達本次自訂配音上限，需重新授權。');}
       else tell((skipped?'未設定聲線的角色已略過。':'播放完成。')+' 自訂配音仍啟用；剩餘 '+left.requests+' 次、'+left.characters+' 字元。');
     }else tell(skipped?'部分台詞缺少可用的本地聲線。可調整角色聲線，或手動使用遠端聲線。':'播放完成。');
   }
   seq.watch=setInterval(()=>{if(!current())stopSequence();},250);
   next();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disableAutomatic();});
 window.addEventListener('pagehide',disableAutomatic);
 App.wrapShowView('story-voice:leave',function(next,name,...args){
   if(name!=='chat'&&automatic)disableAutomatic();
   return next(name,...args);
 });
 App.wrapSendMessage('story-voice:read-dialogue',async function(next,...args){
   const session=automatic;
   if(session)stopSequence();
   const turn=await next(...args);
   if(session&&session===automatic&&turn?.complete&&turn.isCurrent?.()&&same(session)){
     const latest=Chat.messages.at(-1);
     if(latest?.id===turn.assistantId)playReply(latest);
   }
   return turn;
 });
 function open(){
   if(active||!GameState.current||!App.activeCharacter)return;
   const current=scope(),sourceInput=document.getElementById('user-input');
   if(!sourceInput)return;
   const synth=window.speechSynthesis,Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
   const modal=el('dialog');modal.className='yoru-voice-dialog';modal.setAttribute('aria-label','角色語音與語音輸入');
   if(typeof modal.showModal!=='function')return;
   const focus=document.activeElement;
   const title=el('h2','角色語音與語音輸入'),note=el('p','選配工具。語音輸入只填入文字，不會送出；可開啟角色台詞自動配音。語音與故事原文互不改寫。');
   const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const setStatus=t=>{status.textContent=t;};
   let recognition=null,recognitionTimer=null,utterance=null,playTimer=null,closed=false,externalJob=null,ttsJob=null,localJob=null,localURL=null,localEpoch=0;
   const valid=()=>!closed&&modal.isConnected&&same(current)&&document.getElementById('user-input')===sourceInput;
   const cancelSpeech=()=>{if(utterance){utterance.onend=utterance.onerror=null;synth?.cancel();utterance=null;}clearTimeout(playTimer);cancelTTS();};
   const cancelRecognition=()=>{if(recognition){const rec=recognition;recognition=null;rec.onresult=rec.onerror=rec.onend=null;try{rec.abort();}catch(_){}}clearTimeout(recognitionTimer);cancelExternal();};
   const cleanup=()=>{if(closed)return;closed=true;notify=null;window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',onVisibility);cancelSpeech();cancelRecognition();clearLocal();clearInterval(watch);synth?.removeEventListener?.('voiceschanged',refreshVoices);modal.remove();active=null;if(focus?.isConnected)focus.focus();};
   const close=()=>{if(closed)return;modal.close();cleanup();};
   const onVisibility=()=>{if(document.hidden)close();};
   const inputSection=el('section');inputSection.append(el('h3','玩家語音轉文字（STT）'));
   const inputLang=field('輸入語言');options(inputLang.input,languageOptions);
   const disclosure=el('p','裝置／瀏覽器語音辨識可能將錄音送往其雲端服務，不一定離線；夜灣不保存錄音、不將音訊傳給 RP 模型。');
   const consent=field('我同意使用瀏覽器語音辨識服務','input');consent.input.type='checkbox';
   const draft=field('辨識文字預覽（可修改）','textarea');draft.input.rows=4;draft.input.maxLength=12000;
   let startingText=sourceInput.value;
   const provider=field('語音辨識來源');options(provider.input,[['device','裝置語音辨識（預設）'],['custom','自訂 STT 接口（進階）']]);
   const advanced=el('div');advanced.hidden=true;
   const endpoint=field('STT 接口網址','input');endpoint.input.type='url';endpoint.input.placeholder='https://服務網址/v1/audio/transcriptions';
   const model=field('STT 模型 ID','input');model.input.maxLength=200;
   const apiKey=field('STT API Key（選填）','input');apiKey.input.type='password';apiKey.input.autocomplete='off';apiKey.input.maxLength=4096;
   const customConsent=field('我同意將本次錄音傳至上述接口，可能由該服務收費','input');customConsent.input.type='checkbox';
   const supported=()=>Boolean(navigator.mediaDevices?.getUserMedia&&typeof window.MediaRecorder==='function');
   const selected=()=>provider.input.value==='custom';
   function cancelExternal(){
     const job=externalJob;externalJob=null;if(!job)return;
     clearTimeout(job.timer);job.controller.abort();
     if(job.rec){job.rec.ondataavailable=job.rec.onstop=job.rec.onerror=null;try{if(job.rec.state!=='inactive')job.rec.stop();}catch(_){}}
     job.stream?.getTracks().forEach(t=>t.stop());job.chunks.length=0;
   }
   function syncControls(){
     const busy=Boolean(externalJob);start.disabled=selected()?!supported()||busy:!Recognition||Boolean(recognition);
     provider.input.disabled=busy||Boolean(recognition);for(const n of [endpoint.input,model.input,apiKey.input,inputLang.input,customConsent.input])n.disabled=busy;
     stop.disabled=selected()?externalJob?.phase!=='recording':!recognition;
     abortButton.hidden=!busy;
   }
   async function startExternal(){
     if(!supported()){setStatus('裝置不支援錄音，可使用鍵盤輸入。');return;}
     if(!customConsent.input.checked){setStatus('請先確認錄音傳送及可能費用。');return;}
     const raw={endpoint:endpoint.input.value,model:model.input.value,key:apiKey.input.value,language:inputLang.input.value};
     try{Core.sttConfig(raw);}catch(e){setStatus(e.message);return;}
     disableAutomatic();auto.input.checked=false;cancelSpeech();cancelRecognition();clearLocal();
     const capturedDraft=sourceInput.value;customConsent.input.checked=false;
     const job={controller:new AbortController(),chunks:[],bytes:0,phase:'permission',stream:null,rec:null,timer:null};externalJob=job;syncControls();
     const live=()=>externalJob===job&&valid()&&inStory()&&!App.__requestPending;
     const fail=msg=>{if(externalJob===job){cancelExternal();syncControls();if(valid())setStatus(msg);}};
     job.timer=setTimeout(()=>fail('錄音已逾時，未自動傳送。'),60000);
     setStatus('等待麥克風權限…');
     try{
       const stream=await navigator.mediaDevices.getUserMedia({audio:true});
       if(!live()){stream.getTracks().forEach(t=>t.stop());return;}
       job.stream=stream;const types=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'];
       const mime=types.find(t=>MediaRecorder.isTypeSupported?.(t));
       const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);job.rec=rec;
       rec.ondataavailable=e=>{if(!live()||!e.data?.size)return;job.bytes+=e.data.size;if(job.bytes>Core.STT_MAX_BYTES){fail('錄音超過 8 MiB，未傳送。');return;}job.chunks.push(e.data);};
       rec.onerror=()=>fail('錄音失敗，未傳送。');
       rec.onstop=async()=>{
         if(!live())return;
         if(job.phase!=='sending'){fail('錄音意外停止，未傳送。');return;}
         stream.getTracks().forEach(t=>t.stop());clearTimeout(job.timer);
         const blob=new Blob(job.chunks,{type:rec.mimeType||job.chunks[0]?.type});job.chunks.length=0;
         job.timer=setTimeout(()=>fail('STT 連線逾時，請手動重試或打字。'),60000);
         setStatus('正在使用指定 STT 接口辨識…');
         try{const result=await Core.transcribe(raw,blob,{signal:job.controller.signal});if(live()){startingText=capturedDraft;draft.input.value=result;cancelExternal();syncControls();setStatus('辨識完成，請確認文字後填入。');}else if(externalJob===job){fail('故事狀態已變更，已捨棄辨識結果。');}}
         catch(_){fail('STT 辨識失敗，請檢查服務網址、CORS、音訊格式或額度；可繼續打字。');}
       };
       job.phase='recording';rec.start(250);syncControls();setStatus('錄音中；按停止辨識才傳送至指定接口。');
     }catch(_){fail('無法啟動錄音，請確認麥克風權限或使用鍵盤輸入。');}
   }
   const savedInput=readCustom().stt;
   if(savedInput){endpoint.input.value=savedInput.endpoint;model.input.value=savedInput.model;inputLang.input.value=savedInput.language;}
   const saveSTT=btn('保存 STT 接口設定',()=>{
     if(!valid()||externalJob||recognition)return;
     try{writeCustom('stt',Core.savedSTT({endpoint:endpoint.input.value,model:model.input.value,language:inputLang.input.value}));setStatus('已保存 STT 網址、模型與語言；不保存金鑰或授權。');}catch(e){setStatus(e.message||'無法保存設定。');}
   });
   const forgetSTT=btn('清除已保存 STT 設定',()=>{
     if(!valid()||externalJob||recognition)return;
     try{writeCustom('stt',null);endpoint.input.value=model.input.value=apiKey.input.value='';customConsent.input.checked=false;setStatus('已清除 STT 設定。');}catch(_){setStatus('無法清除設定。');}
   });
   endpoint.input.addEventListener('input',()=>{apiKey.input.value='';customConsent.input.checked=false;});
   advanced.append(el('p','只支援相容 /audio/transcriptions 的服務。玩家自行申請或架設、確認格式與費用；需 HTTPS（本機可用 loopback HTTP）、CORS 與瀏覽器權限。可保存網址與模型；金鑰和傳送授權不保存。'),endpoint.wrap,model.wrap,apiKey.wrap,saveSTT,forgetSTT,customConsent.wrap);
   const start=btn('開始語音辨識',()=>{
     if(!valid()||App.__requestPending||externalJob||recognition||localJob)return;
     if(selected()){void startExternal();return;}
     if(!Recognition){setStatus('此瀏覽器不支援語音辨識，可使用裝置鍵盤的語音輸入。');return;}
     if(!consent.input.checked){setStatus('請先確認瀏覽器語音辨識的資料傳送說明。');return;}
     disableAutomatic();auto.input.checked=false;cancelSpeech();cancelRecognition();clearLocal();
     startingText=sourceInput.value;consent.input.checked=false;
     const rec=new Recognition();recognition=rec;rec.lang=inputLang.input.value;rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=1;
     rec.onresult=e=>{if(recognition===rec&&valid())draft.input.value=Core.finalTranscript(e.results);};
     rec.onerror=()=>{if(recognition===rec&&valid())setStatus('語音辨識未完成，請檢查麥克風權限、網路或語言支援。');};
     rec.onend=()=>{if(recognition!==rec)return;recognition=null;clearTimeout(recognitionTimer);syncControls();if(valid()&&draft.input.value)setStatus('辨識完成，請確認文字後填入。');};
     try{rec.start();syncControls();setStatus('正在辨識語音…');recognitionTimer=setTimeout(()=>{cancelRecognition();syncControls();setStatus('辨識已逾時，請確認現有文字。');},60000);}
     catch(_){cancelRecognition();syncControls();setStatus('無法啟動語音辨識。');}
   });
   const stop=btn('停止辨識',()=>{
     if(externalJob?.phase==='recording'){
       if(!valid()||!inStory()||App.__requestPending){cancelExternal();syncControls();setStatus('故事狀態已變更，未傳送錄音。');return;}
       const job=externalJob;job.phase='sending';syncControls();
       try{job.rec.stop();}catch(_){cancelExternal();syncControls();setStatus('錄音停止失敗，未傳送。');}
       return;
     }
     if(recognition)try{recognition.stop();}catch(_){cancelRecognition();syncControls();}
   });
   const abortButton=btn('取消本次錄音／辨識',()=>{cancelExternal();syncControls();setStatus('已取消。');});
   provider.input.addEventListener('change',()=>{cancelRecognition();consent.input.checked=false;customConsent.input.checked=false;advanced.hidden=!selected();disclosure.hidden=consent.wrap.hidden=selected();syncControls();});
   for(const n of [endpoint.input,model.input,apiKey.input,inputLang.input])n.addEventListener('input',()=>{customConsent.input.checked=false;});
   syncControls();
   const apply=btn('將文字填入故事輸入框',()=>{
     if(!valid()||App.__requestPending)return;
     if(recognition||externalJob){setStatus('請先停止辨識。');return;}
     if(!draft.input.value.trim()){setStatus('沒有可填入的文字。');return;}
     if(sourceInput.value!==startingText){setStatus('原輸入框已變更，請複製辨識文字並手動合併，避免覆蓋。');return;}
     if(window.BAOStoryImages?.hasDraft?.()){setStatus('故事有待送圖片，請先處理附件，避免改變照片收件範圍。');return;}
     try{sourceInput.value=Core.mergeDraft(startingText,draft.input.value,sourceInput.maxLength>0?sourceInput.maxLength:12000);sourceInput.dispatchEvent(new Event('input',{bubbles:true}));close();sourceInput.focus();}catch(e){setStatus(e.message);}
   });
   inputSection.append(provider.wrap,inputLang.wrap,disclosure,consent.wrap,advanced,start,stop,abortButton,draft.wrap,apply);
   if(!Recognition)inputSection.append(el('small','不支援此 API 時，仍可使用系統鍵盤語音輸入。'));
   const output=el('section');output.append(el('h3','角色台詞配音（TTS）'));
   if(automatic&&!same(automatic))disableAutomatic();
   const auto=field('自動朗讀角色台詞','input');auto.input.type='checkbox';
   auto.input.checked=Boolean(automatic&&!automatic.custom);
   auto.input.disabled=!synth||typeof window.SpeechSynthesisUtterance!=='function';
   const autoStatus=el('p',notice);autoStatus.setAttribute('aria-live','polite');
   notify=t=>{autoStatus.textContent=t;auto.input.checked=Boolean(automatic&&!automatic.custom);};
   auto.input.addEventListener('change',()=>{
     if(!auto.input.checked||!valid()||localJob){disableAutomatic();return;}
     cancelRecognition();syncControls();cancelSpeech();clearLocal();
     disableAutomatic();automatic=current;
     tell('已開啟本章節角色配音。');
     playReply(Chat.messages.at(-1));
   });
   output.append(auto.wrap,el('small','開啟後，以已保存的本地聲線朗讀目前及後續回覆中的角色台詞。關閉工具後繼續播放。'),autoStatus,btn('停止所有自動配音',()=>{disableAutomatic();setStatus('已關閉自動配音。');}));
   const speaker=field('配音角色'),{people}=castFor(current);
   options(speaker.input,[['','選擇角色'],...[...people.values()].slice(0,100).map(p=>[p.id,p.name])]);
   const lang=field('配音語言');options(lang.input,languageOptions);
   const voice=field('裝置聲線');
   const sliders=[['rate','語速',.5,1.5,1],['pitch','音高',.5,1.5,1],['volume','音量',0,1,1]].map(([name,label,min,max,value])=>{
     const x=field(label,'input');x.input.type='range';x.input.min=min;x.input.max=max;x.input.step=.05;x.input.value=value;const val=el('output',String(value));x.wrap.append(val);x.input.addEventListener('input',()=>{val.value=x.input.value;});return {name,...x,val};
   });
   const key=()=>Core.profileKey(current.card.id||current.card.name,speaker.input.value);
   let selectedURI='';
   function refreshVoices(){
     const list=Core.voicesFor(synth?.getVoices?.()||[],lang.input.value);
     options(voice.input,[['','自動（僅裝置本地聲線）'],...list.map(v=>[v.voiceURI,v.name+' · '+v.lang+(v.localService===true?'（本地）':'（可能連網）')])]);
     if(selectedURI&&!list.some(v=>v.voiceURI===selectedURI)){const missing=el('option','原聲線目前不可用，請重新選擇');missing.value=selectedURI;voice.input.append(missing);}
     voice.input.value=selectedURI;
   }
   const profile=()=>Core.profile({language:lang.input.value,voiceURI:selectedURI,...Object.fromEntries(sliders.map(s=>[s.name,Number(s.input.value)]))});
   const showProfile=p=>{cancelSpeech();lang.input.value=p.language;selectedURI=p.voiceURI;for(const s of sliders){s.input.value=p[s.name];s.val.value=s.input.value;}refreshVoices();};
   const load=()=>showProfile(Core.profile(read()[key()]));
   speaker.input.addEventListener('change',load);lang.input.addEventListener('change',()=>{cancelSpeech();selectedURI='';refreshVoices();});
   voice.input.addEventListener('change',()=>{cancelSpeech();selectedURI=voice.input.value;});
   const remember=btn('保存角色聲線設定',()=>{if(!valid()||!speaker.input.value){setStatus('請先選擇角色。');return;}try{save(key(),profile());setStatus('已保存本機聲線設定。');}catch(_){setStatus('本機聲線設定無法保存。');}});
   const messages=Chat.messages.filter(m=>m.role==='assistant'&&m.id).slice(-20).reverse();
   const source=field('選擇故事回覆');options(source.input,[['','手動輸入台詞'],...messages.map((m,i)=>[String(i),'回覆 '+(messages.length-i)+' · '+String(m.content||'').replace(/\s+/g,' ').slice(0,36)])]);
   const quotes=field('可能的台詞（須手動確認）');
   const text=field('實際配音台詞（可編輯／貼上翻譯）','textarea');text.input.maxLength=Core.MAX_TEXT;text.input.rows=4;
   let suggestions=[];
   const refreshQuotes=()=>{const m=source.input.value===''?null:messages[Number(source.input.value)];suggestions=Core.candidates(m?.content);options(quotes.input,[['','選擇台詞，不自動朗讀'],...suggestions.map((t,i)=>[String(i),t])]);};
   source.input.addEventListener('change',()=>{cancelSpeech();text.input.value='';refreshQuotes();});quotes.input.addEventListener('change',()=>{cancelSpeech();if(quotes.input.value!=='')text.input.value=suggestions[Number(quotes.input.value)];});
   const remote=field('我同意此聲線可能將台詞傳給裝置／瀏覽器語音服務','input');remote.input.type='checkbox';
   for(const n of [speaker.input,lang.input,voice.input,text.input,source.input,quotes.input,...sliders.map(s=>s.input)])n.addEventListener('input',()=>{remote.input.checked=false;cancelSpeech();});
   const pack=el('details');pack.append(el('summary','聲線設定包（匯入／匯出）'),el('p','只包含裝置聲線識別及語言、語速、音高、音量。不是音訊、模型或聲音複製；其他裝置可能沒有同一聲線。匯入先預覽，另按保存才寫入選定角色。'));
   const packFile=field('選擇聲線設定包 JSON','input');packFile.input.type='file';packFile.input.accept='.json,application/json';
   let importEpoch=0;
   for(const n of [speaker.input,lang.input,voice.input,...sliders.map(s=>s.input)])n.addEventListener('input',()=>{importEpoch++;});
   packFile.input.addEventListener('change',async()=>{
     const file=packFile.input.files?.[0];packFile.input.value='';
     const epoch=++importEpoch,selected=speaker.input.value;
     if(!file||!valid())return;
     if(!selected){setStatus('請先選擇要套用聲線的角色。');return;}
     if(file.size>Core.PACK_LIMIT){setStatus('聲線設定包超過大小限制。');return;}
     try{
       const p=Core.importPack(await file.text());
       if(!valid()||epoch!==importEpoch||selected!==speaker.input.value)return;
       remote.input.checked=false;showProfile(p);
       setStatus('已預覽匯入聲線，尚未保存。請確認語言及聲線後另按保存角色聲線設定。');
     }catch(e){if(valid()&&epoch===importEpoch)setStatus(e.message||'無法讀取聲線設定包。');}
   });
   const exportVoice=btn('匯出目前聲線設定包',()=>{
     if(!valid()||!speaker.input.value){setStatus('請先選擇角色。');return;}
     const url=URL.createObjectURL(new Blob([Core.exportPack(profile())],{type:'application/json'})),a=el('a');
     a.href=url;a.download='yorubay-voice-profile.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
     setStatus('已準備匯出目前聲線設定，不含角色資料、台詞、API Key 或音訊。');
   });
   pack.append(packFile.wrap,exportVoice);
   const ttsProvider=field('配音來源');options(ttsProvider.input,[['device','裝置聲線（預設）'],['custom','自訂 TTS 接口（進階）']]);
   const ttsAdvanced=el('div');ttsAdvanced.hidden=true;
   const ttsEndpoint=field('TTS 接口網址','input');ttsEndpoint.input.type='url';ttsEndpoint.input.placeholder='https://服務網址/v1/audio/speech';
   const ttsModel=field('TTS 模型 ID','input');ttsModel.input.maxLength=200;
   const ttsVoice=field('TTS 聲線 ID','input');ttsVoice.input.maxLength=200;
   const ttsKey=field('TTS API Key（選填）','input');ttsKey.input.type='password';ttsKey.input.autocomplete='off';ttsKey.input.maxLength=4096;
   const ttsConsent=field('我同意將本次確認的台詞傳至指定 TTS 接口，可能收費','input');ttsConsent.input.type='checkbox';
   const autoConsent=field('我同意本章節後續角色台詞自動傳至指定 TTS 接口，可能收費','input');autoConsent.input.type='checkbox';
   const audio=el('audio');audio.controls=true;audio.preload='none';audio.hidden=true;audio.setAttribute('aria-label','生成的角色語音');
   let audioURL=null;
   function cancelTTS(){
     const job=ttsJob;ttsJob=null;if(job){clearTimeout(job.timer);job.controller.abort();}
     if(audioURL){audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(audioURL);audioURL=null;}
     audio.hidden=true;
   }
   const customTTS=()=>ttsProvider.input.value==='custom';
   // Temporary per-character voice selection; credentials and endpoint stay
   // in the dialog and are never serialized into story or profile packs.
   const customId='tts:'+JSON.stringify(String(current.card.id||current.card.name));
   const storedTTS=readCustom()[customId];
   const customVoices=new Map((storedTTS?.voices||[]).filter(([id])=>people.has(id)));
   let lastSpeaker=speaker.input.value,customSpeed=storedTTS?.speed??1;
   let restoredIdentity=storedTTS?JSON.stringify([storedTTS.endpoint,storedTTS.model]):null;
   if(storedTTS){ttsEndpoint.input.value=storedTTS.endpoint;ttsModel.input.value=storedTTS.model;}
   const grant=field('自動配音使用上限');
   options(grant.input,[['standard','一般：20 次／6,000 字／30 分鐘'],['extended','延長：100 次／30,000 字／2 小時'],['long','長時間：300 次／90,000 字／4 小時']]);
   const rateSlider=sliders[0];
   const showCustomSpeed=()=>{rateSlider.input.value=customSpeed;rateSlider.val.value=rateSlider.input.value;};
   rateSlider.input.addEventListener('input',()=>{if(customTTS())customSpeed=Number(rateSlider.input.value);});
   ttsEndpoint.input.addEventListener('input',()=>{ttsKey.input.value='';});
   for(const n of [ttsEndpoint.input,ttsModel.input])n.addEventListener('input',()=>{
     if(restoredIdentity&&restoredIdentity!==JSON.stringify([ttsEndpoint.input.value,ttsModel.input.value])){
       restoredIdentity=null;customVoices.clear();ttsVoice.input.value='';ttsKey.input.value='';
       setStatus('服務已變更，請重新指定角色聲線與金鑰。');
     }
   });
   const selectedVoices=()=>{
     const values=new Map(customVoices);values.set(speaker.input.value,ttsVoice.input.value);
     return [...values].filter(([id,v])=>id&&people.has(id)&&v.trim());
   };
   const saveTTS=btn('保存自訂 TTS 與角色聲線',()=>{
     if(!valid()||!customTTS())return;
     try{
       const cfg=Core.savedTTS({endpoint:ttsEndpoint.input.value,model:ttsModel.input.value,speed:customSpeed},selectedVoices());
       writeCustom(customId,cfg);restoredIdentity=JSON.stringify([cfg.endpoint,cfg.model]);
       setStatus('已保存本機 TTS 設定與角色聲線；不保存金鑰或授權。');
     }catch(e){setStatus(e.message||'無法保存設定。');}
   });
   const forgetTTS=btn('清除已保存 TTS 設定',()=>{
     if(!valid())return;
     try{writeCustom(customId,null);disableAutomatic();cancelSpeech();customVoices.clear();restoredIdentity=null;ttsEndpoint.input.value=ttsModel.input.value=ttsVoice.input.value=ttsKey.input.value='';customSpeed=1;showCustomSpeed();ttsConsent.input.checked=autoConsent.input.checked=false;setStatus('已清除 TTS 設定及自動配音授權。');}catch(_){setStatus('無法清除設定。');}
   });
   speaker.input.addEventListener('change',()=>{
     customVoices.set(lastSpeaker,ttsVoice.input.value);
     lastSpeaker=speaker.input.value;ttsVoice.input.value=customVoices.get(lastSpeaker)||'';if(customTTS())showCustomSpeed();
     ttsConsent.input.checked=false;cancelTTS();
   });
   function syncTTS(){
     ttsAdvanced.hidden=!customTTS();remote.wrap.hidden=customTTS();voice.wrap.hidden=lang.wrap.hidden=customTTS();
     auto.input.disabled=customTTS()||!synth||typeof window.SpeechSynthesisUtterance!=='function';
     for(const slider of sliders.filter(x=>x.name!=='rate'))slider.wrap.hidden=customTTS();
     remember.hidden=pack.hidden=customTTS();
     speak.disabled=!customTTS()&&(!synth||typeof window.SpeechSynthesisUtterance!=='function');
     speak.textContent=customTTS()?'生成確認的台詞':'播放確認的台詞';
   }
   ttsProvider.input.addEventListener('change',()=>{cancelSpeech();if(customTTS()||automatic?.custom)disableAutomatic();remote.input.checked=false;ttsConsent.input.checked=false;autoConsent.input.checked=false;syncTTS();if(customTTS())showCustomSpeed();else load();});
   for(const n of [ttsEndpoint.input,ttsModel.input,ttsVoice.input,ttsKey.input,speaker.input,lang.input,text.input,source.input,quotes.input,...sliders.map(s=>s.input)])n.addEventListener('input',()=>{ttsConsent.input.checked=false;cancelTTS();});
   for(const n of [ttsEndpoint.input,ttsModel.input,ttsVoice.input,ttsKey.input,speaker.input,sliders[0].input,grant.input])n.addEventListener('input',()=>{autoConsent.input.checked=false;if(automatic?.custom){disableAutomatic();tell('配音設定已變更，請重新授權。');}});
   audio.addEventListener('error',()=>{if(audioURL){cancelTTS();setStatus('裝置無法解碼此語音，請確認服務回傳格式。');}});
   async function generateTTS(){
     if(ttsJob||!valid()||!inStory()||App.__requestPending)return;
     if(!ttsConsent.input.checked){setStatus('請先確認台詞傳送及可能費用。');return;}
     const raw={endpoint:ttsEndpoint.input.value,model:ttsModel.input.value,voice:ttsVoice.input.value,key:ttsKey.input.value,speed:Number(sliders[0].input.value)};
     let line;try{Core.ttsConfig(raw);line=Core.script(text.input.value);}catch(e){setStatus(e.message);return;}
     disableAutomatic();cancelSpeech();clearLocal();ttsConsent.input.checked=false;
     const job={controller:new AbortController(),timer:null};ttsJob=job;
     job.timer=setTimeout(()=>{if(ttsJob===job){cancelTTS();setStatus('TTS 連線逾時，請手動重試。');}},60000);
     setStatus('正在生成指定角色語音…');
     try{
       const blob=await Core.synthesize(raw,line,{signal:job.controller.signal});
       if(ttsJob!==job)return;
       if(!valid()||!inStory()||App.__requestPending){cancelTTS();return;}
       clearTimeout(job.timer);ttsJob=null;audioURL=URL.createObjectURL(blob);audio.src=audioURL;audio.hidden=false;
       setStatus('語音已生成，請按播放器播放。');
     }catch(_){if(ttsJob===job){cancelTTS();setStatus('TTS 生成失敗，請檢查接口、CORS、聲線或額度；可手動切回裝置聲線。');}}
   }
   const startAutoTTS=btn('啟用本章節自訂自動配音',()=>{
     if(!valid()||!inStory()||App.__requestPending||recognition||externalJob||localJob||!customTTS())return;
     if(automatic?.custom){setStatus('自訂自動配音已啟用，請先停止。');return;}
     if(!autoConsent.input.checked){setStatus('請先確認自動傳送台詞及可能費用。');return;}
     const raw={endpoint:ttsEndpoint.input.value,model:ttsModel.input.value,key:ttsKey.input.value,speed:Number(sliders[0].input.value)};
     const voices=new Map(customVoices);voices.set(speaker.input.value,ttsVoice.input.value);
     const selected=new Map();let cfg;
     try{
       for(const [id,voice] of voices){if(!id||!people.has(id)||!voice.trim())continue;cfg=Core.ttsConfig({...raw,voice});selected.set(id,cfg.voice);}
       if(!cfg||!selected.size)throw Error('請至少為一個角色設定有效聲線 ID。');
     }catch(e){setStatus(e.message);return;}
     disableAutomatic();cancelSpeech();clearLocal();autoConsent.input.checked=false;ttsConsent.input.checked=false;
     const preset=grant.input.value,limits=Core.autoTTSLimits(preset);
     const custom={cfg,voices:selected,budget:Core.autoTTSBudget(preset),expiry:null,watch:null};
     const session={...current,custom};automatic=session;
     custom.expiry=setTimeout(()=>{if(automatic===session){disableAutomatic();tell('本次自訂配音授權已到期。');}},limits.durationMs);
     custom.watch=setInterval(()=>{if(automatic===session&&(!same(session)||!inStory()))disableAutomatic();},250);
     tell('本章節自訂自動配音已啟用；只讀後續成功回覆中的角色台詞。');
     setStatus('已授權後續自動配音；尚未送出請求。');
   });
   ttsAdvanced.append(el('p','相容 /audio/speech 的自架或自帶 API。手動生成只傳確認台詞；聲線 ID 與語速由服務處理。設定可明確保存於本機，金鑰及授權僅暫存。'),ttsEndpoint.wrap,ttsModel.wrap,ttsVoice.wrap,ttsKey.wrap,saveTTS,forgetTTS,ttsConsent.wrap,audio,el('p','自動配音僅讀後續成功回覆的已映射台詞。自選用量上限，不代表實際費用；本機接口也不保證免費。關閉工具可繼續播放，切換故事／章節、離開、背景化或停止即失效。'),grant.wrap,autoConsent.wrap,startAutoTTS);
   const speak=btn('播放確認的台詞',()=>{
     if(!valid()||recognition||externalJob||localJob)return;
     if(customTTS()){if(!speaker.input.value){setStatus('請先選擇角色。');return;}void generateTTS();return;}
     if(!synth||typeof window.SpeechSynthesisUtterance!=='function'){setStatus('此瀏覽器不支援語音播放。');return;}
     if(!speaker.input.value){setStatus('請先選擇角色。');return;}
     const p=profile();let script;try{script=Core.script(text.input.value);}catch(e){setStatus(e.message);return;}
     const v=Core.selectVoice(synth.getVoices(),p);
     if(!v){setStatus('此語言沒有可用的本地或指定聲線。請安裝語言包或手動選擇聲線，不會自動改用其他語言。');return;}
     if(v.localService!==true&&!remote.input.checked){setStatus('此聲線可能連網，請先確認資料傳送。');return;}
     remote.input.checked=false;disableAutomatic();cancelSpeech();clearLocal();
     const u=new SpeechSynthesisUtterance(script);utterance=u;u.voice=v;u.lang=p.language;u.rate=p.rate;u.pitch=p.pitch;u.volume=p.volume;
     u.onend=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('播放完成。');}};
     u.onerror=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('語音播放失敗，請確認裝置聲線。');}};
     try{synth.speak(u);setStatus('正在播放角色台詞…');playTimer=setTimeout(()=>{cancelSpeech();setStatus('播放已逾時。');},180000);}catch(_){cancelSpeech();setStatus('無法播放語音。');}
   });
   output.append(ttsProvider.wrap,speaker.wrap,lang.wrap,voice.wrap,...sliders.map(s=>s.wrap),remember,pack,source.wrap,quotes.wrap,text.wrap,el('small','手動配音可選句、編輯或貼上翻譯。'),remote.wrap,ttsAdvanced,speak,btn('停止播放',()=>{if(automatic?.custom)disableAutomatic();else stopSequence();cancelSpeech();setStatus('已停止播放。');}));
   syncTTS();
   load();refreshQuotes();synth?.addEventListener?.('voiceschanged',refreshVoices);
   const localSection=el('details');localSection.append(el('summary','玩家錄音／音檔預覽（本機）'),el('p','錄音與語音轉文字分開。可明確保存至本章節音訊庫，未保存的音檔關閉工具即捨棄。僅在本機，不傳送給角色、AI 或語音服務，不進入故事正文、Phone 或一般故事備份。最多 60 秒、8 MiB。'));
   const localFile=field('選擇本機音檔','input');localFile.input.type='file';localFile.input.accept='audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,.wav,.mp3,.m4a,.ogg,.webm';
   const localAudio=el('audio');localAudio.controls=true;localAudio.preload='metadata';localAudio.hidden=true;localAudio.setAttribute('aria-label','本機音檔預覽');
   const localInfo=el('p');localInfo.setAttribute('aria-live','polite');
   let localReady=false,localDuration=null,localExtension='',metadataTimer=null,localBlob=null,localSaving=false,collectionEpoch=0;
   function releaseRecording(){
     const job=localJob;localJob=null;if(!job)return;
     clearTimeout(job.timer);
     if(job.rec){job.rec.ondataavailable=job.rec.onstop=job.rec.onerror=null;try{if(job.rec.state!=='inactive')job.rec.stop();}catch(_){}}
     job.stream?.getTracks().forEach(t=>t.stop());job.chunks.length=0;
   }
   function clearLocal(){
     localEpoch++;releaseRecording();clearTimeout(metadataTimer);
     localAudio.onloadedmetadata=localAudio.onerror=null;localAudio.pause();
     localAudio.removeAttribute('src');localAudio.load();
     if(localURL)URL.revokeObjectURL(localURL);localURL=null;
     localAudio.hidden=true;localReady=false;localDuration=null;localExtension='';localBlob=null;localInfo.textContent='';
     syncLocal();
   }
   function syncLocal(){
     localStart.disabled=Boolean(localJob)||!supported();
     localStop.disabled=localJob?.phase!=='recording';
     localFile.input.disabled=Boolean(localJob);
     localDownload.disabled=!localReady;
     localSave.disabled=!localReady||localSaving||!window.BAOStoryVoiceAssets||!current.storyId||!current.chapterId;
   }
   const localLive=()=>valid()&&inStory()&&!App.__requestPending;
   function localFail(message){clearLocal();if(valid())localInfo.textContent=message;}
   async function previewLocal(blob,epoch,recordedSeconds=null){
     try{
       const result=await Core.localAudioDraft(blob);
       if(epoch!==localEpoch||!localLive())return;
       localBlob=result.blob;localURL=URL.createObjectURL(result.blob);localExtension=result.extension;
       localAudio.onloadedmetadata=()=>{
         if(epoch!==localEpoch||!localLive())return;
         const seconds=Number.isFinite(localAudio.duration)?localAudio.duration:recordedSeconds;
         if(!Number.isFinite(seconds)||seconds<=0||seconds>Core.AUDIO_DRAFT_MAX_SECONDS){localFail('音檔須為可辨識長度且不超過 60 秒。');return;}
         clearTimeout(metadataTimer);localDuration=seconds;localReady=true;localAudio.hidden=false;
         localInfo.textContent='本機音檔已就緒（'+Math.ceil(localDuration)+' 秒）；尚未傳送。';syncLocal();
       };
       localAudio.onerror=()=>{if(epoch===localEpoch)localFail('瀏覽器無法解碼此音檔。');};
       metadataTimer=setTimeout(()=>{if(epoch===localEpoch&&!localReady)localFail('無法讀取音檔長度或格式。');},10000);
       localAudio.src=localURL;localAudio.load();
     }catch(e){if(epoch===localEpoch&&localLive())localFail(e.message||'無法讀取本機音檔。');}
   }
   function beginLocal(){
     if(!localLive()||recognition||externalJob||ttsJob||localJob)return false;
     disableAutomatic();cancelSpeech();clearLocal();return true;
   }
   const localStart=btn('開始本機錄音',async()=>{
     if(!supported()||!beginLocal())return;
     const epoch=localEpoch,job={phase:'permission',chunks:[],bytes:0,rec:null,stream:null,timer:null,start:0};
     localJob=job;syncLocal();localInfo.textContent='等待麥克風權限…';
     const live=()=>localJob===job&&epoch===localEpoch&&localLive();
     job.timer=setTimeout(()=>{if(localJob===job)localFail('麥克風權限等待逾時。');},60000);
     try{
       const stream=await navigator.mediaDevices.getUserMedia({audio:true});
       if(!live()){stream.getTracks().forEach(t=>t.stop());return;}
       job.stream=stream;
       const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t));
       const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);job.rec=rec;
       rec.ondataavailable=e=>{if(!live()||!e.data?.size)return;job.bytes+=e.data.size;if(job.bytes>Core.AUDIO_DRAFT_MAX_BYTES){localFail('錄音超過 8 MiB，已捨棄。');return;}job.chunks.push(e.data);};
       rec.onerror=()=>{if(live())localFail('本機錄音失敗。');};
       rec.onstop=()=>{
         if(!live())return;
         if(job.phase!=='stopping'){localFail('錄音意外停止，已捨棄。');return;}
         const seconds=job.seconds;
         const blob=new Blob(job.chunks,{type:rec.mimeType||job.chunks[0]?.type});
         releaseRecording();syncLocal();localInfo.textContent='正在驗證本機音檔…';
         void previewLocal(blob,epoch,seconds);
       };
       clearTimeout(job.timer);job.phase='recording';job.start=performance.now();rec.start(250);syncLocal();
       localInfo.textContent='本機錄音中；停止後可預覽，不會傳送。';
       job.timer=setTimeout(()=>{if(live())finishLocal();},Core.AUDIO_DRAFT_MAX_SECONDS*1000-250);
     }catch(_){if(localJob===job)localFail('無法啟動本機錄音，請確認麥克風權限。');}
   });
   function finishLocal(){
     const job=localJob;if(!job||job.phase!=='recording')return;
     clearTimeout(job.timer);job.seconds=Math.max(.001,(performance.now()-job.start)/1000);job.phase='stopping';syncLocal();
     job.timer=setTimeout(()=>{if(localJob===job)localFail('錄音停止逾時，已捨棄。');},5000);
     try{job.rec.stop();}catch(_){localFail('無法停止錄音。');}
   }
   const localStop=btn('停止本機錄音',finishLocal);
   const localDownload=btn('下載本機音檔',()=>{
     if(!localLive()||!localReady||!localURL)return;
     const a=el('a');a.href=localURL;a.download='yorubay-recording.'+localExtension;document.body.append(a);a.click();a.remove();
   });
   localFile.input.addEventListener('change',()=>{
     const file=localFile.input.files?.[0];localFile.input.value='';if(!file||!beginLocal())return;
     localInfo.textContent='正在驗證本機音檔…';void previewLocal(file,localEpoch);
   });
   localInfo.dataset.localAudioStatus='1';
   const collection=el('details');
   collection.append(el('summary','本章節已保存音訊'),el('p','僅本機收藏，不是已送達的故事訊息。每章最多 32 段，全站音訊庫 128 MiB；可另外下載故事＋音訊備份。刪除故事或章節會清理相應音訊；保留的分支不受影響。'));
   const collectionList=el('div');collectionList.setAttribute('aria-label','本章節音訊清單');
   const collectionInfo=el('p');collectionInfo.setAttribute('aria-live','polite');
   async function refreshCollection(){
     const ticket=++collectionEpoch;
     if(!localLive()||!collection.open)return;
     collectionList.replaceChildren();collectionInfo.textContent='讀取本機音訊…';
     try{
       const rows=await window.BAOStoryVoiceAssets.list(current);
       if(ticket!==collectionEpoch||!localLive()||!collection.open)return;
       collectionInfo.textContent=rows.length?'已保存 '+rows.length+' 段音訊。':'本章節尚無已保存音訊。';
       for(const [index,row] of rows.entries()){
         const item=el('section');
         item.append(el('p','音訊 '+(index+1)+' · '+Math.ceil(row.duration)+' 秒 · '+Math.ceil(row.size/1024)+' KiB'));
         item.append(btn('預覽音訊 '+(index+1),async()=>{
           if(!beginLocal())return;
           const epoch=localEpoch;
           try{
             const asset=await window.BAOStoryVoiceAssets.get(current,row.id);
             if(epoch===localEpoch&&localLive()){localSection.open=true;await previewLocal(asset.blob,epoch,asset.row.duration);}
           }catch(e){if(epoch===localEpoch&&localLive())localFail(e.message);}
         }));
         const confirmDelete=field('確認刪除音訊 '+(index+1),'input');confirmDelete.input.type='checkbox';
         const remove=btn('刪除音訊 '+(index+1),async()=>{
           if(!localLive()||!confirmDelete.input.checked)return;
           remove.disabled=true;
           try{await window.BAOStoryVoiceAssets.remove(current,row.id);if(localLive()){clearLocal();await refreshCollection();}}
           catch(e){if(localLive()){collectionInfo.textContent=e.message;remove.disabled=false;}}
         });remove.disabled=true;confirmDelete.input.addEventListener('change',()=>{remove.disabled=!confirmDelete.input.checked;});
         item.append(confirmDelete.wrap,remove);collectionList.append(item);
       }
     }catch(e){if(ticket===collectionEpoch&&localLive())collectionInfo.textContent=e.message||'無法讀取本機音訊。';}
   }
   const localSave=btn('保存至本章節音訊庫',async()=>{
     if(!localLive()||!localReady||localSaving||!localBlob)return;
     const epoch=localEpoch,blob=localBlob,duration=localDuration;localSaving=true;syncLocal();
     try{
       await window.BAOStoryVoiceAssets.save(current,blob,duration,()=>localLive()&&epoch===localEpoch);
       if(localLive()&&epoch===localEpoch){localInfo.textContent='已保存本機音訊，尚未傳送給角色。';collection.open=true;await refreshCollection();}
     }catch(e){if(localLive()&&epoch===localEpoch)localInfo.textContent=e.message||'保存失敗，音檔仍可下載。';}
     finally{localSaving=false;if(valid())syncLocal();}
   });
   const backup=el('details');
   backup.append(el('summary','故事＋本機音訊備份'),el('p','備份包含所有仍存在章節的本機音訊與故事資料，可能包含私人錄音。普通 JSON／TXT／Drive 及生成圖集備份不含音訊；此備份也不含生成圖集。請妥善保存。匯入建立新故事副本。'));
   const backupStatus=el('p');backupStatus.setAttribute('aria-live','polite');
   const exportAudio=btn('下載故事＋音訊備份',async()=>{
     if(!localLive())return;
     exportAudio.disabled=true;
     try{
       const bundle=await window.BAOStoryVoiceBackup.exportStory(current.storyId);
       if(!localLive())return;
       const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});
       if(blob.size>window.BAOStoryVoiceBackup.MAX_FILE)throw Error('完整備份超過 192 MiB，請先下載並整理音訊。');
       const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='yorubay-voiced-story.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
       backupStatus.textContent='已交給瀏覽器下載，請確認備份檔案。';
     }catch(e){if(valid())backupStatus.textContent=e.message||'備份失敗。';}
     finally{exportAudio.disabled=false;}
   });
   const restoreAudio=field('匯入故事＋音訊備份','input');restoreAudio.input.type='file';restoreAudio.input.accept='.json,application/json';
   restoreAudio.input.addEventListener('change',async()=>{
     const file=restoreAudio.input.files?.[0];restoreAudio.input.value='';
     if(!file||!localLive())return;
     restoreAudio.input.disabled=true;
     try{
       if(file.size>window.BAOStoryVoiceBackup.MAX_FILE)throw Error('備份超過 192 MiB。');
       const value=JSON.parse(await file.text());if(!localLive())return;
       const imported=await window.BAOStoryVoiceBackup.importStory(value);
       if(valid())backupStatus.textContent='已匯入 '+imported.chapterCount+' 個章節的故事與音訊，請從故事書庫開啟副本。';
     }catch(e){if(valid())backupStatus.textContent=e.message||'匯入失敗。';}
     finally{restoreAudio.input.disabled=false;}
   });
   const retryCleanup=btn('重試已刪除故事音訊清理',async()=>{
     if(!localLive())return;
     retryCleanup.disabled=true;
     try{const ok=await window.BAOStoryLibrary.cleanupDeletedVoiceAssets();if(valid())backupStatus.textContent=ok?'已清理已刪除故事及章節的音訊。':'音訊清理仍未完成，請稍後重試。';}
     finally{retryCleanup.disabled=false;}
   });
   backup.append(exportAudio,restoreAudio.wrap,retryCleanup,backupStatus);
   collection.append(collectionInfo,collectionList,backup);
   collection.addEventListener('toggle',()=>{if(collection.open&&localSection.open)void refreshCollection();else if(!collection.open)collectionEpoch++;});
   localSection.append(localFile.wrap,localStart,localStop,btn('捨棄本機音檔／取消錄音',()=>{clearLocal();localInfo.textContent='已捨棄本機音檔。';}),localAudio,localDownload,localSave,localInfo,collection);
   localSection.addEventListener('toggle',()=>{if(!localSection.open){if(localJob){clearLocal();localInfo.textContent='已停止並捨棄本機錄音。';}else localAudio.pause();}});
   syncLocal();
   modal.append(title,note,inputSection,output,localSection,status,btn('關閉',close));document.body.append(modal);active=modal;
   window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',onVisibility);modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('close',cleanup);
   const watch=setInterval(()=>{if(!valid()||!inStory()||((externalJob||ttsJob||audioURL||localJob||localURL)&&App.__requestPending))close();},250);
   try{modal.showModal();}catch(_){cleanup();}
 }
 function mount(){
   // Keep the existing mobile composer geometry untouched. The Control Center
   // mirrors sidebar actions into its searchable drawer on every viewport.
   const sidebar=document.querySelector('#chat-view .chat-layout > aside');
   if(!sidebar)return;
   const host=sidebar.querySelector('[data-chat-tool-body="scene"]')||sidebar;
   let b=sidebar.querySelector('[data-bao-voice-tools]');
   if(!b){
     b=btn('語音工具',open);b.className='secondary yoru-voice-trigger';b.dataset.baoVoiceTools='1';
     b.dataset.searchKeywords='語音 配音 聲線 麥克風 日語 韓語 TTS STT';
     b.setAttribute('aria-label','語音工具');
   }
   if(b.parentElement!==host)host.append(b);
 }
 App.wrapRenderChatShell('story-voice:optional-tools',function(next,...args){const result=next(...args);if(automatic&&!same(automatic))disableAutomatic();mount();return result;});
 window.BAOStoryVoice=Object.freeze({open,mount});
})();
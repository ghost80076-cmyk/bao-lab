/* Explicit opt-in voice tools. Automatic dialogue uses local device voices during an opted-in story session. */
(()=>{
 'use strict';
 const Core=window.BAOStoryVoiceCore;
 if(!Core||typeof App==='undefined'||typeof Chat==='undefined'||window.BAOStoryVoice)return;
 const STORE='yorubay-device-voice-v1';
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
 function stopSequence(){
   const seq=sequence;
   sequence=null;
   if(!seq)return;
   clearInterval(seq.watch);
   clearTimeout(seq.timeout);
   if(seq.utterance){
     seq.utterance.onend=seq.utterance.onerror=null;
     window.speechSynthesis?.cancel();
   }
 }
 function disableAutomatic(){
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
   if(!lines.length){tell('這則回覆沒有可辨識的角色台詞。');return;}
   const seq={utterance:null,watch:null,timeout:null};
   sequence=seq;
   const synth=window.speechSynthesis;
   const available=synth.getVoices(),profiles=read();
   let index=0,skipped=0;
   function current(){
     const latest=Chat.messages.at(-1);
     return automatic===session&&inStory()&&same(session)&&latest?.id===message.id&&latest.content===content&&(latest.activeVariant||0)===variant;
   }
   function next(){
     if(sequence!==seq)return;
     clearTimeout(seq.timeout);
     seq.utterance=null;
     if(!current()){stopSequence();return;}
     while(index<lines.length){
       const {speakerId,text}=lines[index++];
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
     tell(skipped?'部分台詞缺少可用的本地聲線。可調整角色聲線，或手動使用遠端聲線。':'播放完成。');
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
   let recognition=null,recognitionTimer=null,utterance=null,playTimer=null,closed=false,externalJob=null;
   const valid=()=>!closed&&modal.isConnected&&same(current)&&document.getElementById('user-input')===sourceInput;
   const cancelSpeech=()=>{if(utterance){utterance.onend=utterance.onerror=null;synth?.cancel();utterance=null;}clearTimeout(playTimer);};
   const cancelRecognition=()=>{if(recognition){const rec=recognition;recognition=null;rec.onresult=rec.onerror=rec.onend=null;try{rec.abort();}catch(_){}}clearTimeout(recognitionTimer);cancelExternal();};
   const cleanup=()=>{if(closed)return;closed=true;notify=null;window.removeEventListener('pagehide',close);cancelSpeech();cancelRecognition();clearInterval(watch);synth?.removeEventListener?.('voiceschanged',refreshVoices);modal.remove();active=null;if(focus?.isConnected)focus.focus();};
   const close=()=>{modal.close();cleanup();};
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
     disableAutomatic();auto.input.checked=false;cancelSpeech();cancelRecognition();
     startingText=sourceInput.value;customConsent.input.checked=false;draft.input.value='';
     const job={controller:new AbortController(),chunks:[],bytes:0,phase:'permission',stream:null,rec:null,timer:null};externalJob=job;syncControls();
     const live=()=>externalJob===job&&valid()&&!document.hidden;
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
         if(!live()||job.phase!=='sending')return;
         stream.getTracks().forEach(t=>t.stop());clearTimeout(job.timer);
         const blob=new Blob(job.chunks,{type:rec.mimeType||job.chunks[0]?.type});job.chunks.length=0;
         job.timer=setTimeout(()=>fail('STT 連線逾時，請手動重試或打字。'),60000);
         setStatus('正在使用指定 STT 接口辨識…');
         try{const result=await Core.transcribe(raw,blob,{signal:job.controller.signal});if(live()){draft.input.value=result;cancelExternal();syncControls();setStatus('辨識完成，請確認文字後填入。');}}
         catch(_){fail('STT 辨識失敗，請檢查服務網址、CORS、音訊格式或額度；可繼續打字。');}
       };
       job.phase='recording';rec.start(250);syncControls();setStatus('錄音中；按停止辨識才傳送至指定接口。');
     }catch(_){fail('無法啟動錄音，請確認麥克風權限或使用鍵盤輸入。');}
   }
   advanced.append(el('p','只支援相容 /audio/transcriptions 的服務。玩家自行申請或架設、確認格式與費用；需 HTTPS（本機可用 loopback HTTP）、CORS 與瀏覽器權限。設定只保留至本工具關閉，金鑰不寫入故事或聲線包。'),endpoint.wrap,model.wrap,apiKey.wrap,customConsent.wrap);
   const start=btn('開始語音辨識',()=>{
     if(!valid()||App.__requestPending||externalJob||recognition)return;
     if(selected()){void startExternal();return;}
     if(!Recognition){setStatus('此瀏覽器不支援語音辨識，可使用裝置鍵盤的語音輸入。');return;}
     if(!consent.input.checked){setStatus('請先確認瀏覽器語音辨識的資料傳送說明。');return;}
     disableAutomatic();auto.input.checked=false;cancelSpeech();cancelRecognition();
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
   auto.input.checked=Boolean(automatic);
   auto.input.disabled=!synth||typeof window.SpeechSynthesisUtterance!=='function';
   const autoStatus=el('p',notice);autoStatus.setAttribute('aria-live','polite');
   notify=t=>{autoStatus.textContent=t;auto.input.checked=Boolean(automatic);};
   auto.input.addEventListener('change',()=>{
     if(!auto.input.checked||!valid()){disableAutomatic();return;}
     cancelRecognition();syncControls();cancelSpeech();
     automatic=current;
     tell('已開啟本章節角色配音。');
     playReply(Chat.messages.at(-1));
   });
   output.append(auto.wrap,el('small','開啟後，以已保存的本地聲線朗讀目前及後續回覆中的角色台詞。關閉工具後繼續播放。'),autoStatus);
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
   const speak=btn('播放確認的台詞',()=>{
     if(!valid()||recognition||externalJob)return;
     if(!synth||typeof window.SpeechSynthesisUtterance!=='function'){setStatus('此瀏覽器不支援語音播放。');return;}
     if(!speaker.input.value){setStatus('請先選擇角色。');return;}
     const p=profile();let script;try{script=Core.script(text.input.value);}catch(e){setStatus(e.message);return;}
     const v=Core.selectVoice(synth.getVoices(),p);
     if(!v){setStatus('此語言沒有可用的本地或指定聲線。請安裝語言包或手動選擇聲線，不會自動改用其他語言。');return;}
     if(v.localService!==true&&!remote.input.checked){setStatus('此聲線可能連網，請先確認資料傳送。');return;}
     remote.input.checked=false;disableAutomatic();cancelSpeech();
     const u=new SpeechSynthesisUtterance(script);utterance=u;u.voice=v;u.lang=p.language;u.rate=p.rate;u.pitch=p.pitch;u.volume=p.volume;
     u.onend=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('播放完成。');}};
     u.onerror=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('語音播放失敗，請確認裝置聲線。');}};
     try{synth.speak(u);setStatus('正在播放角色台詞…');playTimer=setTimeout(()=>{cancelSpeech();setStatus('播放已逾時。');},180000);}catch(_){cancelSpeech();setStatus('無法播放語音。');}
   });
   output.append(speaker.wrap,lang.wrap,voice.wrap,...sliders.map(s=>s.wrap),remember,pack,source.wrap,quotes.wrap,text.wrap,el('small','手動配音可選句、編輯或貼上翻譯。'),remote.wrap,speak,btn('停止播放',()=>{stopSequence();cancelSpeech();setStatus('已停止播放。');}));
   speak.disabled=!synth||typeof window.SpeechSynthesisUtterance!=='function';
   load();refreshQuotes();synth?.addEventListener?.('voiceschanged',refreshVoices);
   modal.append(title,note,inputSection,output,status,btn('關閉',close));document.body.append(modal);active=modal;
   window.addEventListener('pagehide',close);modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('close',cleanup);
   const watch=setInterval(()=>{if(!valid()||document.visibilityState==='hidden'||document.getElementById('chat-view')?.classList.contains('active')===false)close();},250);
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
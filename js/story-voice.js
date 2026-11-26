/* Explicit opt-in voice tools. No audio/model download, API request or automatic playback. */
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
 function open(){
   if(active||!GameState.current||!App.activeCharacter)return;
   const current=scope(),sourceInput=document.getElementById('user-input');
   if(!sourceInput)return;
   const synth=window.speechSynthesis,Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
   const modal=el('dialog');modal.className='yoru-voice-dialog';modal.setAttribute('aria-label','角色語音與語音輸入');
   if(typeof modal.showModal!=='function')return;
   const focus=document.activeElement;
   const title=el('h2','角色語音與語音輸入'),note=el('p','選配工具。語音輸入只填入文字，不會送出；配音只播放你確認的台詞。語音與故事原文互不改寫。');
   const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const setStatus=t=>{status.textContent=t;};
   let recognition=null,recognitionTimer=null,utterance=null,playTimer=null,closed=false;
   const valid=()=>!closed&&modal.isConnected&&same(current)&&document.getElementById('user-input')===sourceInput;
   const cancelSpeech=()=>{if(utterance){utterance.onend=utterance.onerror=null;synth?.cancel();utterance=null;}clearTimeout(playTimer);};
   const cancelRecognition=()=>{if(recognition){const rec=recognition;recognition=null;rec.onresult=rec.onerror=rec.onend=null;try{rec.abort();}catch(_){}}clearTimeout(recognitionTimer);};
   const cleanup=()=>{if(closed)return;closed=true;cancelSpeech();cancelRecognition();clearInterval(watch);synth?.removeEventListener?.('voiceschanged',refreshVoices);modal.remove();active=null;if(focus?.isConnected)focus.focus();};
   const close=()=>{modal.close();cleanup();};
   const inputSection=el('section');inputSection.append(el('h3','玩家語音轉文字（STT）'));
   const inputLang=field('輸入語言');options(inputLang.input,languageOptions);
   const disclosure=el('p','裝置／瀏覽器語音辨識可能將錄音送往其雲端服務，不一定離線；夜灣不保存錄音、不將音訊傳給 RP 模型。');
   const consent=field('我同意使用瀏覽器語音辨識服務','input');consent.input.type='checkbox';
   const draft=field('辨識文字預覽（可修改）','textarea');draft.input.rows=4;draft.input.maxLength=12000;
   let startingText=sourceInput.value;
   const start=btn('開始語音辨識',()=>{
     if(!valid()||App.__requestPending)return;
     if(!Recognition){setStatus('此瀏覽器不支援語音辨識，可使用裝置鍵盤的語音輸入。');return;}
     if(!consent.input.checked){setStatus('請先確認瀏覽器語音辨識的資料傳送說明。');return;}
     cancelSpeech();cancelRecognition();
     startingText=sourceInput.value;consent.input.checked=false;
     const rec=new Recognition();recognition=rec;rec.lang=inputLang.input.value;rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=1;
     rec.onresult=e=>{if(recognition===rec&&valid())draft.input.value=Core.finalTranscript(e.results);};
     rec.onerror=()=>{if(recognition===rec&&valid())setStatus('語音辨識未完成，請檢查麥克風權限、網路或語言支援。');};
     rec.onend=()=>{if(recognition!==rec)return;recognition=null;clearTimeout(recognitionTimer);start.disabled=false;if(valid()&&draft.input.value)setStatus('辨識完成，請確認文字後填入。');};
     try{rec.start();start.disabled=true;setStatus('正在辨識語音…');recognitionTimer=setTimeout(()=>{cancelRecognition();start.disabled=false;setStatus('辨識已逾時，請確認現有文字。');},60000);}
     catch(_){cancelRecognition();start.disabled=false;setStatus('無法啟動語音辨識。');}
   });
   start.disabled=!Recognition;
   const stop=btn('停止辨識',()=>{if(recognition)try{recognition.stop();}catch(_){cancelRecognition();start.disabled=false;}});
   const apply=btn('將文字填入故事輸入框',()=>{
     if(!valid()||App.__requestPending)return;
     if(recognition){setStatus('請先停止辨識。');return;}
     if(!draft.input.value.trim()){setStatus('沒有可填入的文字。');return;}
     if(sourceInput.value!==startingText){setStatus('原輸入框已變更，請複製辨識文字並手動合併，避免覆蓋。');return;}
     if(window.BAOStoryImages?.hasDraft?.()){setStatus('故事有待送圖片，請先處理附件，避免改變照片收件範圍。');return;}
     try{sourceInput.value=Core.mergeDraft(startingText,draft.input.value,sourceInput.maxLength>0?sourceInput.maxLength:12000);sourceInput.dispatchEvent(new Event('input',{bubbles:true}));close();sourceInput.focus();}catch(e){setStatus(e.message);}
   });
   inputSection.append(inputLang.wrap,disclosure,consent.wrap,start,stop,draft.wrap,apply);
   if(!Recognition)inputSection.append(el('small','不支援此 API 時，仍可使用系統鍵盤語音輸入。'));
   const output=el('section');output.append(el('h3','角色台詞配音（TTS）'));
   const speaker=field('配音角色'),people=new Map();
   const addPerson=n=>{if(!n)return;const id=String(n.id||n.name||'');if(id&&!people.has(id))people.set(id,String(n.name||id));};
   addPerson(current.card);
   for(const n of [...(Array.isArray(current.card.initial_state?.npcs)?current.card.initial_state.npcs:[]),...(Array.isArray(current.owner.npcs)?current.owner.npcs:[])])addPerson(n);
   options(speaker.input,[['','選擇角色'],...Array.from(people.entries()).slice(0,100)]);
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
   const load=()=>{cancelSpeech();const p=Core.profile(read()[key()]);lang.input.value=p.language;selectedURI=p.voiceURI;for(const s of sliders){s.input.value=p[s.name];s.val.value=s.input.value;}refreshVoices();};
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
   const speak=btn('播放確認的台詞',()=>{
     if(!valid()||recognition)return;
     if(!synth||typeof window.SpeechSynthesisUtterance!=='function'){setStatus('此瀏覽器不支援語音播放。');return;}
     if(!speaker.input.value){setStatus('請先選擇角色。');return;}
     const p=profile();let script;try{script=Core.script(text.input.value);}catch(e){setStatus(e.message);return;}
     const v=Core.selectVoice(synth.getVoices(),p);
     if(!v){setStatus('此語言沒有可用的本地或指定聲線。請安裝語言包或手動選擇聲線，不會自動改用其他語言。');return;}
     if(v.localService!==true&&!remote.input.checked){setStatus('此聲線可能連網，請先確認資料傳送。');return;}
     remote.input.checked=false;cancelSpeech();
     const u=new SpeechSynthesisUtterance(script);utterance=u;u.voice=v;u.lang=p.language;u.rate=p.rate;u.pitch=p.pitch;u.volume=p.volume;
     u.onend=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('播放完成。');}};
     u.onerror=()=>{if(utterance===u){utterance=null;clearTimeout(playTimer);setStatus('語音播放失敗，請確認裝置聲線。');}};
     try{synth.speak(u);setStatus('正在播放角色台詞…');playTimer=setTimeout(()=>{cancelSpeech();setStatus('播放已逾時。');},180000);}catch(_){cancelSpeech();setStatus('無法播放語音。');}
   });
   output.append(speaker.wrap,lang.wrap,voice.wrap,...sliders.map(s=>s.wrap),remember,source.wrap,quotes.wrap,text.wrap,el('small','只朗讀確認的台詞；引號僅是候選，不判斷說話者、旁白或心理活動。選語言不是翻譯。'),remote.wrap,speak,btn('停止播放',()=>{cancelSpeech();setStatus('已停止播放。');}));
   speak.disabled=!synth||typeof window.SpeechSynthesisUtterance!=='function';
   load();refreshQuotes();synth?.addEventListener?.('voiceschanged',refreshVoices);
   modal.append(title,note,inputSection,output,status,btn('關閉',close));document.body.append(modal);active=modal;
   modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('close',cleanup);
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
 App.wrapRenderChatShell('story-voice:optional-tools',function(next,...args){const result=next(...args);mount();return result;});
 window.BAOStoryVoice=Object.freeze({open,mount});
})();
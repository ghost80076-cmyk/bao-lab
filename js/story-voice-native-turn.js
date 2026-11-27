/* Explicit one-shot story audio; raw bytes are materialized only at transport. */
(()=>{
 'use strict';
 const Core=window.BAOStoryVoiceCore;
 if(!Core||typeof App==='undefined'||typeof API==='undefined')return;
 let draft=null,attempt=null,panel=null,notice='',epoch=0;
 const input=()=>document.getElementById('user-input');
 const scope=()=>({owner:GameState.current,card:App.activeCharacter,...window.BAOStoryLibrary?.refs?.()});
 const history=()=>JSON.stringify(Chat.messages.map(m=>Core.storyVoiceSource(m)));
 const same=s=>{const n=scope();return !!s.owner&&n.owner===s.owner&&n.card===s.card&&n.storyId===s.storyId&&n.chapterId===s.chapterId;};
 const active=()=>!document.hidden&&document.getElementById('chat-view')?.classList.contains('active');
 const validRoute=(rec,cfg=App.config?.api)=>{try{const n=Core.nativeAudioRoute(cfg),r=rec.route;return n.endpoint===r.endpoint&&n.model===r.model&&n.key===r.key;}catch(_){return false;}};
 const unchanged=rec=>same(rec.scope)&&history()===rec.history&&input()?.value.trim()===rec.text&&validRoute(rec);
 const blocked=()=>App.config?.demoMode||App.config?.offlineWorldPreview||window.BAOStoryImages?.hasDraft?.();
 const status=text=>{notice=text;sync();};
 function sync(){
   if(draft&&!attempt&&(!same(draft.scope)||!active())){draft=null;notice='';}
   if(!panel)return;
   panel.hidden=!draft&&!notice;
   const send=panel.querySelector('[data-native-send]'),remove=panel.querySelector('[data-native-remove]');
   send.hidden=remove.hidden=!draft;
   send.disabled=!!attempt||!!App.__requestPending||!draft||!unchanged(draft)||!!blocked();
   remove.disabled=!!attempt;
   panel.querySelector('[role="status"]').textContent=notice||(draft?'待送原始音訊 · '+Math.ceil(draft.duration)+' 秒 · '+draft.route.model:'');
 }
 function mount(){
   const composer=document.querySelector('#chat-view .composer');if(!composer)return;
   if(!panel?.isConnected){
     panel=document.createElement('section');panel.className='yoru-native-audio-draft';panel.hidden=true;
     const note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
     const button=(text,key,fn)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset[key]='1';b.textContent=text;b.onclick=fn;return b;};
     panel.append(note,button('送出音訊與文字','nativeSend',()=>void send()),button('移除待送音訊','nativeRemove',()=>{if(!attempt){draft=null;notice='';epoch++;sync();}}));
     composer.before(panel);
     input()?.addEventListener('input',()=>{if(draft&&!attempt){notice=unchanged(draft)?'':'文字、故事或模型已變更；請移除音訊後重新確認。';sync();}});
   }
   sync();
 }
 async function stage(blob,duration,sourceIsCurrent,confirmed){
   if(confirmed!==true||!sourceIsCurrent()||!active()||attempt||draft||App.__requestPending||blocked())throw Error('請先處理待送圖片／音訊並確認本次傳送。');
   const current=scope(),text=input()?.value.trim(),route=Core.nativeAudioRoute(App.config?.api),prior=history(),ticket=++epoch;
   if(!current.storyId||!current.chapterId||!text)throw Error('請先在故事輸入框寫下誰能聽見音訊及本輪行動，再開啟語音工具。');
   const part=await Core.nativeAudioPart(blob,duration),rec={scope:current,text,route,history:prior,part,blob,duration};
   if(ticket!==epoch||!sourceIsCurrent()||!active()||!unchanged(rec)||draft||attempt||blocked())throw Error('故事、模型或文字已變更，請重新確認。');
   draft=rec;notice='';mount();
 }
 async function send(){
   if(!draft||attempt||App.__requestPending)return;
   if(!active()||!unchanged(draft)||blocked()){status('故事、模型或文字已變更，請移除後重新確認。');return;}
   const rec={draft,ticket:{},used:false,finished:false,playerId:null};attempt=rec;
   notice='正在送出原始音訊與故事文字…';sync();
   try{await App.sendMessage(rec.ticket);}
   catch(_){notice='音訊故事請求未完成；請確認後手動重試。';}
   finally{
     if(attempt===rec)attempt=null;
     if(!rec.finished&&draft===rec.draft)notice='本輪未完成；原音訊仍待送。再次按送出才會重新請求，先前請求可能已計費。';
     sync();
   }
 }
 function prepare(ticket,text,image){
   if(!attempt&&draft&&!same(draft.scope)){draft=null;notice='';sync();}
   if(!draft&&!attempt)return null;
   if(!attempt||ticket!==attempt.ticket||attempt.draft!==draft||!draft||image||blocked()||!active()||!unchanged(draft)||text!==draft.text){
     status('待送音訊需要使用專用送出按鈕；請確認或移除後再送出。');throw Error('音訊授權或範圍已改變。');
   }
   return attempt;
 }
 const pendingCurrent=rec=>{
   const messages=Chat.messages,player=messages.at(-1);
   return attempt===rec&&draft===rec.draft&&active()&&same(rec.draft.scope)&&validRoute(rec.draft)&&
      player?.id===rec.playerId&&player.role==='user'&&player.content===rec.draft.text&&
      JSON.stringify(messages.slice(0,-1).map(m=>Core.storyVoiceSource(m)))===rec.draft.history;
 };
 function bind(cfg,rec,player){
   if(!rec)return cfg;
   rec.playerId=player.id;
   if(!pendingCurrent(rec)||!validRoute(rec.draft,cfg))throw Error('音訊請求路由或故事已變更。');
   return {...cfg,__storyNativeAudioTicket:rec.ticket,retryEnabled:false};
 }
 function guardTransport(cfg){
   if(attempt?.playerId&&!attempt.finished&&!cfg.__memoryTask&&!cfg.__stateTask&&!cfg.__auxiliaryTask&&!cfg.__storyTool&&!cfg.__connectionTest&&
      cfg.__storyNativeAudioTicket!==attempt.ticket)throw Error('原始音訊授權未傳遞，已停止請求。');
 }
 function materialize(cfg,messages,contents){
   const rec=attempt;
   if(!rec||cfg.__storyNativeAudioTicket!==rec.ticket||rec.used||!pendingCurrent(rec)||!validRoute(rec.draft,cfg)||cfg.__storyImageTicket||cfg.__memoryTask||cfg.__stateTask||cfg.__auxiliaryTask||cfg.__storyTool||cfg.__connectionTest)throw Error('原始音訊請求已失效。');
   const last=messages.filter(m=>m.role!=='system').at(-1),target=contents.at(-1);
   if(last?.role!=='user'||!API.contentToText(last.content).includes(rec.draft.text)||target?.role!=='user'||!Array.isArray(target.parts)||target.parts.some(part=>part.inlineData))throw Error('無法安全對應本輪玩家音訊。');
   rec.used=true;target.parts.push(rec.draft.part);
 }
 function assertDelivered(rec){
   if(rec&&(!rec.used||!pendingCurrent(rec)))throw Error('本輪未確認原始音訊已送達，未保存故事回覆。');
 }
 async function finish(rec,playerId,isCurrent){
   if(!rec)return;
   rec.finished=true;if(draft===rec.draft)draft=null;
   notice='原始音訊故事回覆已完成。';
   try{
     await window.BAOStoryVoiceMessages.saveNative(rec.draft.blob,rec.draft.duration,playerId,()=>same(rec.draft.scope)&&isCurrent());
     notice='已完成故事回覆並保存本機語音訊息。';
   }catch(_){notice='故事回覆已完成，但本機音訊保存失敗；請保留原音檔。不要為保存音訊重複送出本輪。';}
   sync();
 }
 App.wrapRenderChatShell('story-voice:native-draft',function(next,...args){const result=next(...args);mount();return result;});
 window.addEventListener('pagehide',()=>{draft=null;epoch++;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!attempt){draft=null;epoch++;notice='';sync();}});
 window.BAOStoryNativeTurn=Object.freeze({stage,prepare,bind,guardTransport,materialize,assertDelivered,finish,status});
})();
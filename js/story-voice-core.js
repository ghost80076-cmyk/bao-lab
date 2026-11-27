/* Optional browser voice primitives. No network, story state, or model calls. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.BAOStoryVoiceCore=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const LANGUAGES=Object.freeze(['zh-TW','ja-JP','ko-KR','en-US']);
 const MAX_TEXT=1200;
 const clip=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 const bounded=(v,min,max,def)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):def;
 function profile(raw={}){
   if(!raw||typeof raw!=='object')raw={};
   return {language:LANGUAGES.includes(raw.language)?raw.language:'zh-TW',voiceURI:clip(raw.voiceURI,300),
     rate:bounded(raw.rate,.5,1.5,1),pitch:bounded(raw.pitch,.5,1.5,1),volume:bounded(raw.volume,0,1,1)};
 }
 const PACK_SCHEMA='yorubay.voice-profile',PACK_VERSION=1,PACK_LIMIT=16384;
 const exact=(o,keys)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(o,k));
 function exportPack(raw){
   return JSON.stringify({schema:PACK_SCHEMA,version:PACK_VERSION,engine:'web-speech',profile:profile(raw)},null,2);
 }
 function importPack(input){
   if(typeof input!=='string'||input.length>PACK_LIMIT)throw Error('聲線設定包超過大小限制。');
   let value;try{value=JSON.parse(input);}catch(_){throw Error('聲線設定包不是有效 JSON。');}
   if(!exact(value,['schema','version','engine','profile'])||value.schema!==PACK_SCHEMA||value.version!==PACK_VERSION||value.engine!=='web-speech')throw Error('不支援此聲線設定包格式或引擎。');
   const p=value.profile;
   if(!exact(p,['language','voiceURI','rate','pitch','volume'])||!LANGUAGES.includes(p.language)||typeof p.voiceURI!=='string'||p.voiceURI.length>300||/[\u0000-\u001f\u007f]/.test(p.voiceURI)||p.voiceURI!==p.voiceURI.trim())throw Error('聲線設定包包含無效或不支援的欄位。');
   for(const [k,min,max] of [['rate',.5,1.5],['pitch',.5,1.5],['volume',0,1]]){
     if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error('聲線參數超出範圍。');
   }
   return profile(p);
 }
 const profileKey=(card,speaker)=>JSON.stringify([String(card||''),String(speaker||'')]);
 const languageOf=v=>String(v||'').toLowerCase().split(/[-_]/)[0];
 function voicesFor(voices,language){
   if(!LANGUAGES.includes(language))return [];
   return Array.from(voices||[]).filter(v=>v&&typeof v.voiceURI==='string'&&v.voiceURI&&languageOf(v.lang)===languageOf(language));
 }
 function selectVoice(voices,p){
   const list=voicesFor(voices,p.language);
   if(p.voiceURI)return list.find(v=>v.voiceURI===p.voiceURI)||null;
   return list.find(v=>v.localService===true&&v.lang.toLowerCase()===p.language.toLowerCase())||list.find(v=>v.localService===true)||null;
 }
 // Suggestions only: quotation is NOT proof of speech or speaker. Never
 // synthesize any candidate without an explicit player selection and preview.
 function candidates(source){
   if(typeof source!=='string'||/[<>\[\]]/.test(source))return [];
   return [...source.slice(0,40000).matchAll(/「([^」\n]{1,1200})」|『([^』\n]{1,1200})』|“([^”\n]{1,1200})”/g)]
    .map(m=>clip(m[1]||m[2]||m[3],MAX_TEXT)).filter(Boolean).slice(0,30);
 }
 // Automatic reading accepts direct quotation in ordinary story prose. An
 // unrecognized attribution is intentionally different from an absent one.
 const speechVerb = /(?:輕聲|低聲|小聲|笑著|開口|輕輕|接著|大聲|又)?(?:說道|問道|回答道|答道|回應道|回應|回道|回答|回覆|喊道|補充道|解釋道|反問|詢問|低語|說|問|答|喊)(?:了(?:一聲|一句)?)?$/u;
 const thoughtOrWriting = /心想|心裡|心裏|心中|暗想|默念|暗自|忖道|想到|想著|想道|腦中|腦海|(?:他|她|自己)想$|這幾個字|這四個字|字樣|寫著|寫道|寫下|印著|標[著示]|標題|牌上|訊息顯示|螢幕顯示|上面寫/u;
 function directDialogue(source, people, defaultId, playerName=''){
   if(typeof source!=='string'||source.length>40000)return [];
   const body=source.replace(/\[(STATUS|CHOICE|THOUGHT|OOC|NARRATION)\][\s\S]*?(?:\[\/\1\]|$)/gi,'\n')
     .replace(/\[SCENE:[\w-]+\]/gi,'\n')
     .replace(/\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)/g,'\n');
   // Rich cards and unknown structured blocks have separate rendering rules.
   if(/[<>\[\]{}\x60]/u.test(body))return [];
   const names=new Map();
   for(const p of people){
     for(const n of [p.name,...(p.aliases||[])].filter(Boolean)){
       names.set(n,names.has(n)&&names.get(n)!==p.id?null:p.id);
     }
   }
   for(const n of ['玩家','你','妳',playerName].filter(Boolean))names.set(n,null);
   function attribution(cue){
     cue=cue.trim().replace(/[：:,，]\s*$/u,'').replace(/\*\*/g,'').trim();
     if(!cue)return undefined;
     if(thoughtOrWriting.test(cue))return null;
     if(names.has(cue))return names.get(cue);
     const verb=cue.match(speechVerb);
     if(!verb)return null;
     const subject=cue.slice(0,verb.index).trim();
     const who=subject.split(/[，,]/u).at(-1).trim()||subject;
     if(names.has(who))return names.get(who);
     return !who||who==='他'||who==='她'?defaultId:null;
   }
   const parts=[];
   let precedingLine='';
   for(const row of body.split(/\r?\n/)){
     const line=row.trim();
     if(!line)continue;
     if(/^(?:[>#|]|[-*]\s|(?:OOC|系統|旁白|內心|心理|狀態欄|選項)\s*[:：])/iu.test(line)){precedingLine='';continue;}
     // Ignore an unbalanced or nested line instead of reading a partial quote.
     const matches=[...line.matchAll(/「([^「」\n]{1,1200})」/gu)];
     if(matches.length*2!==(line.match(/[「」]/gu)||[]).length){precedingLine='';continue;}
     let end=0,previousId;
     for(const [index,m] of matches.entries()){
       const before=line.slice(end,m.index);
       const prefix=before.trim()||(!end?precedingLine:'');
       const cue=prefix.split(/[。！？!?.；;]/u).at(-1).trim();
       const lead=attribution(cue);
       end=m.index+m[0].length;
       const after=line.slice(end,matches[index+1]?.index??line.length);
       const tail=after.match(/^\s*[,，]?\s*([^，,。！？!?:：「」\n]{1,48})(?:[。！？!.?]|$)/u)?.[1]?.trim();
       const trailingCue=tail&&(speechVerb.test(tail)||thoughtOrWriting.test(tail))?attribution(tail):undefined;
       const fallback=!before.trim()&&previousId!==undefined?previousId:defaultId;
       let id=lead===undefined?fallback:lead;
       if(trailingCue!==undefined){
         id=lead===null||trailingCue===null||(lead&&lead!==trailingCue)?null:trailingCue;
       }
       previousId=id;
       const text=m[1].trim();
       if(id&&text)parts.push({speakerId:id,text});
     }
     precedingLine=matches.length?'':line;
   }
   return parts;
 }
 function script(text){
   if(typeof text!=='string'||!text.trim()||text.trim().length>MAX_TEXT)throw Error('請輸入或確認 1 至 1200 字的配音台詞。');
   return text.trim();
 }
 function mergeDraft(before,transcript,max=12000){
   const result=[String(before||'').trimEnd(),String(transcript||'').trim()].filter(Boolean).join('\n');
   if(result.length>max)throw Error('語音轉文字後超過輸入長度，請手動縮短。');
   return result;
 }
 function finalTranscript(results){
   return Array.from(results||[]).filter(r=>r.isFinal).map(r=>String(r[0]?.transcript||'').trim()).filter(Boolean).join(' ').slice(0,12000);
 }
 return Object.freeze({LANGUAGES,MAX_TEXT,profile,PACK_LIMIT,exportPack,importPack,profileKey,voicesFor,selectVoice,candidates,directDialogue,script,mergeDraft,finalTranscript});
});
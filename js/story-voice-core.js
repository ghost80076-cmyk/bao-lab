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
 return Object.freeze({LANGUAGES,MAX_TEXT,profile,PACK_LIMIT,exportPack,importPack,profileKey,voicesFor,selectVoice,candidates,script,mergeDraft,finalTranscript});
});
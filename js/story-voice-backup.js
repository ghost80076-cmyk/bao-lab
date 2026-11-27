/* Explicit story + local audio portable backup; no automatic Drive sync. */
(()=>{
 'use strict';
 const Assets=window.BAOStoryVoiceAssets,Core=window.BAOStoryVoiceCore;
 if(!Assets)return;
 const MAX_FILE=192*1024*1024;
 async function exportStory(storyId){
   const story=await window.BAOStoryBackup.buildBundle(storyId);
   const audio=await Assets.exportPack(storyId,story.chapters.map(c=>c.chapterId));
   // A rollback or reply edit can leave inactive audio in local storage.
   // Portable messages must resolve to the exact revision exported with them.
   const chapters=new Map(story.chapters.map(chapter=>[chapter.chapterId,chapter.payload]));
   const active=[];
   for(const item of audio.items){
     const payload=chapters.get(item.chapterId);
     if(!item.delivery||await Core.storyVoiceMatches(item.delivery,payload.characterId,payload.chat?.messages))active.push(item);
   }
   audio.items=active;
   audio.version=active.some(item=>item.delivery)?2:1;
   return {schema:'yorubay-voiced-story',version:1,story,audio};
 }
 async function importStory(value){
   if(value?.schema!=='yorubay-voiced-story'||value.version!==1)throw Error('請選擇故事＋本機音訊備份。');
   const story=window.BAOStoryBackup.sanitizeBundle(value.story);
   const rows=await Assets.validatePack(value.audio,story.chapters.map(c=>c.chapterId));
   const chapters=new Map(story.chapters.map(chapter=>[chapter.chapterId,chapter.payload]));
   for(const row of rows){
     const payload=chapters.get(row.chapterId);
     if(row.delivery&&!await Core.storyVoiceMatches(row.delivery,payload.characterId,payload.chat?.messages))
       throw Error('音訊備份的故事訊息版本不符。');
   }
   const imported=await window.BAOStoryBackup.importBundle(story);
   try{await Assets.importPack(rows,imported.storyId,imported.chapterMap);}
   catch(e){
     try{if(!await window.BAOStoryLibrary.deleteStory(imported.storyId))throw Error();}
     catch(_){throw Error('音訊匯入失敗，且無法清除新故事副本。請檢查故事書庫；原故事與備份不受影響。');}
     throw e;
   }
   return imported;
 }
 window.BAOStoryVoiceBackup=Object.freeze({MAX_FILE,exportStory,importStory});
})();
/* Explicit story + local audio portable backup; no automatic Drive sync. */
(()=>{
 'use strict';
 const Assets=window.BAOStoryVoiceAssets;
 if(!Assets)return;
 const MAX_FILE=192*1024*1024;
 async function exportStory(storyId){
   const story=await window.BAOStoryBackup.buildBundle(storyId);
   const audio=await Assets.exportPack(storyId,story.chapters.map(c=>c.chapterId));
   return {schema:'yorubay-voiced-story',version:1,story,audio};
 }
 async function importStory(value){
   if(value?.schema!=='yorubay-voiced-story'||value.version!==1)throw Error('請選擇故事＋本機音訊備份。');
   const story=window.BAOStoryBackup.sanitizeBundle(value.story);
   const rows=await Assets.validatePack(value.audio,story.chapters.map(c=>c.chapterId));
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
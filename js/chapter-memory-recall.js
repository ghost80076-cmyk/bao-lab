/* Optional and bounded source-verified chapter recall after regular prompt building.
 * The story-local opt-in defaults OFF; no new API requests or content mutation. */
(() => {
  'use strict';
  if(!window.BAOChapterMemoryRecallCore||!window.BAOChapterMemoryCore||
      !window.BAOEpisodicMemory||typeof App?.wrapBuildMessages!=='function')return;
  const core=window.BAOChapterMemoryRecallCore;
  const diagnostics=new WeakMap();
  const signature=messages=>JSON.stringify((messages||[]).map(m=>
    [m?.id,m?.role,m?.content,m?.context_content||'']));
  App.wrapBuildMessages('chapter-memory:optional-recall',async function(next,config=this.config,request={}){
    const state=window.GameState?.current;
    if(state?.chapterMemorySettings?.recallEnabled!==true)return next(config,request);
    const character=this.activeCharacter,activeConfig=this.config;
    const transcript=window.Chat?.messages;
    const stamp=signature(transcript);
    const messages=await next(config,request);
    if(!Array.isArray(messages)||!state||window.GameState?.current!==state||
       this.activeCharacter!==character||this.config!==activeConfig||
       window.Chat?.messages!==transcript||signature(transcript)!==stamp)return messages;
    try{
      const decision=core.plan({
        state,config,request,chat:Chat,primary:character?.name||'',baseMessages:messages,
        resolver:window.BAOEpisodicMemory,chapterCore:window.BAOChapterMemoryCore
      });
      // Keep numeric diagnostics only, not story text or model credentials.
      diagnostics.set(state,{
        reason:decision.reason,chapters:decision.selected.length,
        estimatedExtraTokens:decision.addedTokensEstimate||0,
        approximate:true
      });
      return core.inject(messages,decision);
    }catch(error){
      console.warn('YoruBay optional chapter recall skipped after local validation failure:',error);
      diagnostics.set(state,{reason:'validation-error',chapters:0,estimatedExtraTokens:0,approximate:true});
      return messages;
    }
  });
  window.BAOChapterMemoryRecall=Object.freeze({
    snapshot:state=>diagnostics.get(state)||null
  });
})();

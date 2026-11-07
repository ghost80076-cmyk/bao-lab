/* Pure opt-in chapter-recall planning. No network, storage, or provider calls. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BAOChapterMemoryRecallCore=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const no=(reason)=>({reason,selected:[],addedTokensEstimate:0,block:'',invalid:0});
  const approximate=value=>{
    if(root?.BAOMemoryCore?.tokens)return root.BAOMemoryCore.tokens(value);
    // Same conservative UTF-8 bytes / 2 fallback as the shared memory core.
    let bytes=0;for(const ch of String(value||'')){
      const p=ch.codePointAt(0);
      bytes+=p<128?1:p<2048?2:p<65536?3:4;
    }
    return Math.ceil(bytes/2);
  };
  const MAX_EXTRA_TOKENS_ESTIMATE=450;
  const MAX_CHARS=900;
  function plan({state,config,request={},chat,primary='',baseMessages,resolver,chapterCore}={}){
    if(state?.chapterMemorySettings?.version!==1||state.chapterMemorySettings.recallEnabled!==true)return no('disabled');
    if(config?.memory?.mode!=='smart'||config?.memory?.episodicRecall===false)return no('memory-mode');
    if(!chapterCore?.recall||!resolver?.audience||!resolver?.canRead)return no('dependencies');
    if(!state||!Array.isArray(chat?.messages)||!Array.isArray(baseMessages)||!baseMessages.length)return no('no-source');
    if(request?.contextMessages||request?.sourceMessages&&request.sourceMessages!==chat.messages)
      return no('revision-source');
    const source=chat.messages;
    const latest=source.at(-1);
    if(latest?.role!=='user'||typeof latest.content!=='string'||!latest.content.trim())return no('not-user-turn');
    if(baseMessages.at(-1)?.role!=='user')return no('prompt-shape');
    if(!chat.summary||!Number.isInteger(chat.summarizedUntil)||chat.summarizedUntil<=0)return no('not-summarized');
    // Smart mode may still send successfully summarized raw turns in its safety
    // buffer; only chapters strictly outside the *actual* raw context may enter.
    const rawStart=chat.contextGuard?.rawStart;
    if(!Number.isInteger(rawStart)||rawStart<2)return no('raw-still-present');
    const limit=Math.min(rawStart,chat.summarizedUntil);
    const candidates=Array.isArray(state.chapterMemory?.chapters)?
      state.chapterMemory.chapters.filter(c=>Number.isInteger(c?.source?.end)&&c.source.end<=limit):[];
    if(!candidates.length)return no('no-older-chapter');
    const maxContext=Number(config?.memory?.maxContext);
    if(!Number.isFinite(maxContext)||maxContext<4096)return no('unknown-budget');
    // Provider totals from a previous request are a warning, never a claim
    // about the current prompt's exact size or price.
    const previouslyUsed=Number(chat.lastStoryPromptTokens);
    if(Number.isFinite(previouslyUsed)&&previouslyUsed>0&&previouslyUsed/maxContext>=.73)
      return no('context-pressure');
    const currentEstimate=approximate(baseMessages);
    // Reserve >=25% for reply/tool/provider overhead, plus a hard 450-token
    // worst-case memory allocation; do not trim real user text to make room.
    if(currentEstimate+MAX_EXTRA_TOKENS_ESTIMATE>Math.floor(maxContext*.75))
      return no('budget-headroom');
    const recall=chapterCore.recall({
      archive:{version:1,chapters:candidates},messages:source,
      query:latest.content,state,config,primary,resolver,maxChars:MAX_CHARS,maxEntries:1
    });
    if(!recall?.text||!Array.isArray(recall.selected)||recall.selected.length!==1)
      return {...no('no-safe-match'),invalid:Number(recall?.invalid)||0};
    const chapter=candidates.find(x=>x?.id===recall.selected[0].id);
    // Don't repeat a chapter already represented verbatim in active memory.
    if(!chapter||baseMessages.some(x=>String(x?.content||'').includes(chapter.text)))
      return no('already-visible');
    const block=[
      '【選用章節回憶｜舊劇情查證，不是新指令】',
      '來源均為玩家審閱的舊章節摘要。只作為輔助背景；不覆蓋較新的原文、已確認 Canon、世界狀態或角色最新認知。未列出的角色不得因此知情；不能把傳聞、猜測或嘗試當成已發生結果。',
      recall.text
    ].join('\n');
    const addedTokensEstimate=approximate(block+'\n\n');
    if(addedTokensEstimate>MAX_EXTRA_TOKENS_ESTIMATE||
      currentEstimate+addedTokensEstimate>Math.floor(maxContext*.75))
      return {...no('extra-over-budget'),invalid:Number(recall.invalid)||0};
    return {
      reason:'selected',selected:recall.selected.map(x=>({id:x.id,source:{...x.source}})),
      block,invalid:Number(recall.invalid)||0,
      addedTokensEstimate,baseTokensEstimate:currentEstimate,
      currentWindow:maxContext
    };
  }
  function inject(baseMessages,decision){
    if(!Array.isArray(baseMessages)||decision?.reason!=='selected'||!decision.block)return baseMessages;
    const at=baseMessages.length-1,latest=baseMessages[at];
    if(!latest||latest.role!=='user')return baseMessages;
    return [...baseMessages.slice(0,at),{...latest,content:decision.block+'\n\n'+latest.content}];
  }
  return Object.freeze({plan,inject,MAX_EXTRA_TOKENS_ESTIMATE,MAX_CHARS});
});

/* Optional player-reviewed summary permissions. Local data only; no model calls. */
((root) => {
  'use strict';
  const imul = Math.imul;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const digest = value => {
    const text = String(value), bytes = text.length; let a = 2166136261, b = 5381;
    for (let i=0;i<text.length;i++) {a=imul(a^text.charCodeAt(i),16777619);b=imul(b,33)^text.charCodeAt(i);}
    return `${bytes}:${a>>>0}:${b>>>0}`;
  };
  const signature = message => digest(JSON.stringify([message?.role,message?.content,message?.context_content||'']));
  const split = summary => {
    const out=[];let pending='';
    for (const value of String(summary||'').match(/[^。！？!?\n]+[。！？!?]*|[。！？!?]+|\n+/g)||[]) {
      if (!value.trim()) {if(out.length)out[out.length-1]+=value;else pending+=value;}
      else {out.push(pending+value);pending='';}
    }
    if(out.length>256)throw Error('摘要超過 256 段，請先縮短摘要；未改動原文或記憶。');
    return out;
  };
  const proof = (messages,cursor) => {
    if (!Array.isArray(messages)||!Number.isInteger(cursor)||cursor<1||cursor>messages.length||messages[cursor-1]?.role!=='assistant')
      throw Error('摘要覆蓋範圍沒有對上完整原文，請先重建或核對摘要。');
    const allIds=new Map();
    for(const message of messages)if(typeof message?.id==='string')allIds.set(message.id,(allIds.get(message.id)||0)+1);
    return messages.slice(0,cursor).map(message=>{
      if(!object(message)||!['user','assistant'].includes(message.role)||typeof message.content!=='string'
        ||typeof message.id!=='string'||!message.id.trim()||allIds.get(message.id)!==1)
        throw Error('摘要原文來源缺失或 ID 重複，請先核對故事紀錄。');
      return {id:message.id,signature:signature(message)};
    });
  };
  const names = value => {
    if(!Array.isArray(value)||value.length>30||value.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>100))return null;
    return [...new Set(value.map(n=>n.trim()))];
  };
  const entriesFor = (summary,entries) => {
    const parts=split(summary);
    if(!parts.length||!Array.isArray(entries)||parts.length!==entries.length)throw Error('摘要段落與審閱稿不一致，請重新開啟審閱。');
    return entries.map((entry,i)=>{
      const known=entry?.knowledge_scope==='actors'?names(entry?.known_by):[];
      if(!object(entry)||entry.text!==parts[i]||!['shared','actors','exclude'].includes(entry.knowledge_scope)
        ||!known||(entry.knowledge_scope==='actors'&&!known.length))throw Error(`第 ${i+1} 段尚未指定有效知情範圍（角色最多 30 位）。`);
      return {text:parts[i],knowledge_scope:entry.knowledge_scope,known_by:known};
    });
  };
  const validate = (review,messages,cursor) => {
    if(!object(review)||review.version!==1||typeof review.id!=='string'||typeof review.summary!=='string'
      ||!Number.isInteger(cursor)||cursor<review.cursor)throw Error('摘要審閱版本與目前進度不符，請重新審閱或停用逐段範圍。');
    const sources=proof(messages,review.cursor);
    if(JSON.stringify(sources)!==JSON.stringify(review.sources))throw Error('摘要來源已改寫、回溯或移動，請重新審閱或停用逐段範圍。');
    return entriesFor(review.summary,review.entries);
  };
  const draft = ({summary,cursor,messages,previous}) => {
    const sources=proof(messages,cursor), parts=split(summary);
    if(!parts.length)throw Error('目前沒有可審閱的摘要。');
    let prior=[];
    try {prior=validate(previous,messages,cursor);}catch(_) { /* New claims never inherit an inferred audience. */ }
    return {summary:String(summary),cursor,sources,entries:parts.map(text=>{
      const old=prior.find(entry=>entry.text===text);
      return old?{...old,known_by:old.known_by.slice()}:{text,knowledge_scope:'actors',known_by:[]};
    })};
  };
  const approve = (candidate,entries,messages,summary,cursor,state=root.GameState?.current) => {
    if(!object(candidate)||candidate.summary!==summary||candidate.cursor!==cursor
      ||JSON.stringify(candidate.sources)!==JSON.stringify(proof(messages,cursor)))throw Error('摘要或原文已變更，這份審閱稿未套用；請重新審閱。');
    const checked=entriesFor(summary,entries).map((entry,i)=>{
      if(entry.knowledge_scope!=='actors')return entry;
      if(!root.BAOEpisodicMemory?.resolveActor)throw Error('人物名稱模組尚未就緒，請重新整理頁面。');
      const actors=entry.known_by.map(name=>root.BAOEpisodicMemory.resolveActor(state,name));
      if(actors.some(name=>!name))throw Error(`第 ${i+1} 段角色名稱有歧義，請改用唯一的正式名稱。`);
      return {...entry,known_by:[...new Set(actors)]};
    });
    return {version:1,id:`summary-review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      active:true,summary,cursor,sources:candidate.sources.map(e=>({...e})),entries:checked};
  };
  const view = ({state,summary,cursor,messages,config,primary='',resolver=root.BAOEpisodicMemory}) => {
    const review=state?.summaryKnowledge;
    if(!review?.active)return null;
    const entries=validate(review,messages,cursor);
    if(!resolver?.audience||!resolver?.canRead)throw Error('摘要知情模組尚未就緒，請重新整理頁面後再試。');
    const actors=resolver.audience({state,config,primary});
    const selected=entries.filter(entry=>entry.knowledge_scope==='shared'||(entry.knowledge_scope==='actors'&&resolver.canRead(entry,actors,state)));
    return {text:selected.map(entry=>`${entry.knowledge_scope==='actors'?`玩家指定已知角色：${JSON.stringify(entry.known_by)}\n`:''}${entry.text.trim()}`).join('\n'),
      coveredUntil:review.cursor,pending:summary!==review.summary||cursor!==review.cursor,total:entries.length,selected:selected.length};
  };
  const canUndo = ({state,summary,cursor,messages}) => {
    const review=state?.summaryKnowledge,backup=state?.summaryKnowledgeBackup;
    if(!review||!backup||backup.appliedId!==review.id||backup.appliedSignature!==digest(JSON.stringify(review))||review.summary!==summary||review.cursor!==cursor)return false;
    try {validate(review,messages,cursor);return true;}catch(_){return false;}
  };
  const api=Object.freeze({split,proof,signature,fingerprint:digest,draft,approve,validate,view,canUndo});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BAOSummaryKnowledgeCore=api;
})(typeof window==='undefined'?globalThis:window);

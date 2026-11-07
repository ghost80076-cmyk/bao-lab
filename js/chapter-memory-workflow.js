/* Explicit chapter-workbench operations; no model requests and no automatic
 * prompt injection. Works with the existing story-state save transaction. */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOChapterMemoryWorkflow = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';
  const chapterCore = () => root?.BAOChapterMemoryCore ||
    (typeof require === 'function' ? require('./chapter-memory-core.js') : null);
  const memoryCore = () => root?.BAOMemoryCore ||
    (typeof require === 'function' ? require('./memory-core.js') : null);
  const archiveOf = owner => {
    const value = owner?.chapterMemory;
    if (value === undefined) return {version:1,chapters:[]};
    if (!value || value.version !== 1 || !Array.isArray(value.chapters) ||
        value.chapters.length > 200) throw Error('章節索引格式不符，已停止寫入以保護原始資料。');
    return value;
  };
  // Search only contiguous complete exchanges. Greeting and incomplete / tool
  // messages are not guessed into an arbitrary chapter.
  const ranges = (messages = [], archive = null, turnsPerChapter = 20) => {
    const core = chapterCore();
    if (!core || !Array.isArray(messages)) return [];
    const turns = Math.max(1, Math.min(60, Math.floor(Number(turnsPerChapter)||20)));
    const excluded = Array.isArray(archive?.chapters) ? archive.chapters : [];
    const output = [];
    for (let i = 0; i < messages.length;) {
      if (messages[i]?.role !== 'user' || messages[i+1]?.role !== 'assistant') {i++;continue;}
      const start = i;
      let end = i;
      while (end + 1 < messages.length && end - start < turns * 2 &&
        messages[end]?.role === 'user' && messages[end+1]?.role === 'assistant') end+=2;
      try {
        const proof=core.proof(messages,start,end);
        const conflicts=excluded.filter(ch => ch?.source &&
          start < ch.source.end && ch.source.start < end);
        output.push({...proof,available:conflicts.length===0,
          conflicts:conflicts.map(ch=>String(ch.id||'')).slice(0,5)});
      } catch (_) { /* Non-source messages never create a selectable range. */ }
      i=end>start?end:i+1;
    }
    return output;
  };
  const write = async ({owner,next,sourceValid=()=>true,currentOwner=()=>owner,
    currentConfig=()=>null,currentCharacter=()=>null,config=null,character=null,
    isBusy=()=>false,save,flush,load,verify,lock}={}) => {
    const core=memoryCore();
    if (!core?.commitState || !owner || !lock?.start || !lock?.end ||
        typeof save !== 'function' || typeof flush !== 'function' ||
        typeof load !== 'function' || typeof verify !== 'function') {
      throw Error('章節儲存保護未就緒，未寫入任何資料。');
    }
    if (isBusy() || currentOwner()!==owner || currentConfig()!==config ||
        currentCharacter()!==character || !sourceValid()) {
      throw Error('故事或章節來源已改變，請重新開啟章節工作台。');
    }
    const previous=owner.chapterMemory;
    const token={};
    if (!lock.start(owner,{token,label:'章節記憶保存中'})) {
      throw Error('故事目前正在整理或保存資料，請完成後再試。');
    }
    const isCurrent=()=> !isBusy() && currentOwner()===owner && currentConfig()===config &&
      currentCharacter()===character && sourceValid() &&
      (owner.chapterMemory===previous || owner.chapterMemory===next);
    try {
      await core.commitState({
        owner,changes:{chapterMemory:next},isCurrent,
        save,flush,load,verify:async saved=>{
          const persisted=await verify(saved);
          return persisted?.ok===true ? {ok:true} : {ok:false};
        }
      });
      return next;
    } finally {lock.end(owner,token);}
  };
  const saveChapter = async (options={}) => {
    const core=chapterCore();
    if (!core) throw Error('章節記憶核心尚未載入。');
    const {owner,messages,start,end,text,keywords=[],scope,knownBy=[],state=owner,resolver} = options;
    archiveOf(owner);
    const draft=core.createDraft({messages,start,end,text,keywords});
    const chapter=core.approve(draft,{messages,knowledge_scope:scope,known_by:knownBy,state,resolver});
    const next=core.upsert(archiveOf(owner),chapter,messages);
    // Validate the live source again after each await and before claiming a save.
    const getMessages=options.currentMessages || (()=>messages);
    const currentArchive=owner.chapterMemory;
    await write({...options,next,sourceValid:()=>{
      if (owner.chapterMemory!==currentArchive && owner.chapterMemory!==next) return false;
      return core.check(chapter,getMessages()).ok;
    }});
    return chapter;
  };
  const removeChapter = async (options={}) => {
    const {owner,id} = options;
    const archive=archiveOf(owner);
    if (typeof id!=='string' || !archive.chapters.some(ch=>ch?.id===id)) {
      throw Error('找不到要移除的章節；其他章節保持原狀。');
    }
    const next={version:1,chapters:archive.chapters.filter(ch=>ch?.id!==id)};
    await write({...options,next,sourceValid:()=>owner.chapterMemory===archive || owner.chapterMemory===next});
    return next;
  };
  return Object.freeze({ranges,archiveOf,saveChapter,removeChapter});
});

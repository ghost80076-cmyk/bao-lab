/* Source-bound chapter memory primitives. Optional, local-only and deliberately not
   installed into story prompts. No provider calls, storage writes or automatic approvals. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOChapterMemoryCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const VERSION = 1, MAX_SOURCE_MESSAGES = 120, MAX_CHAPTERS = 200;
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const limited = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const fingerprint = value => {
    const source = String(value);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < source.length; i++) {
      a = Math.imul(a ^ source.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ source.charCodeAt(i);
    }
    return source.length + ':' + (a >>> 0) + ':' + (b >>> 0);
  };
  const keywordsOf = value => {
    if (!Array.isArray(value) || value.length > 20 ||
        value.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 60)) {
      throw Error('章節關鍵詞格式不正確。');
    }
    return [...new Set(value.map(item => item.trim()))];
  };
  const knownBy = value => {
    if (!Array.isArray(value) || value.length > 30 ||
        value.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 100)) {
      throw Error('角色知情名單格式不正確。');
    }
    return [...new Set(value.map(item => item.trim()))];
  };
  const proof = (messages, start, end) => {
    if (!Array.isArray(messages) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 0 || end > messages.length || end <= start ||
        end - start > MAX_SOURCE_MESSAGES || (end - start) % 2) {
      throw Error('章節來源需要連續且完整的回合，單章不可超過 60 輪。');
    }
    // IDs must be globally unique: a source ID reused elsewhere invalidates
    // the archive instead of silently binding it to a different branch.
    const seen = new Set();
    for (const message of messages) {
      if (!isObject(message) || typeof message.id !== 'string' || !message.id.trim() ||
          seen.has(message.id)) throw Error('章節來源含缺失或重複的訊息 ID。');
      seen.add(message.id);
    }
    const range = messages.slice(start, end);
    if (!range.every((message, index) =>
      message.role === (index % 2 === 0 ? 'user' : 'assistant') &&
      typeof message.content === 'string' &&
      (message.context_content === undefined || typeof message.context_content === 'string'))) {
      throw Error('章節邊界不是完整且交替的玩家與角色回合。');
    }
    return {
      start, end, firstId: range[0].id, lastId: range.at(-1).id,
      turns: range.length / 2,
      signature: fingerprint(JSON.stringify(range.map(message =>
        [message.id, message.role, message.content, message.context_content || ''])))
    };
  };
  const stampFor = chapter => fingerprint(JSON.stringify([
    chapter.version, chapter.id, chapter.source, chapter.text,
    chapter.keywords, chapter.knowledge_scope, chapter.known_by
  ]));
  const createDraft = ({messages, start, end, text, keywords = []} = {}) => {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
      throw Error('章節摘要必須有文字，且不得超過 2,000 字。');
    }
    const source = proof(messages, start, end);
    return {
      version: VERSION,
      id: 'chapter-' + source.start + '-' + source.end + '-' + fingerprint(source.signature),
      source, text: text.trim(), keywords: keywordsOf(keywords),
      approved: false, knowledge_scope: 'pending', known_by: []
    };
  };
  const check = (chapter, messages) => {
    if (!isObject(chapter) || chapter.version !== VERSION || !isObject(chapter.source) ||
        chapter.approved !== true || !['shared','actors','exclude'].includes(chapter.knowledge_scope) ||
        typeof chapter.text !== 'string' || !chapter.text.trim() || chapter.text.length > 2000 ||
        typeof chapter.approvalStamp !== 'string' || stampFor(chapter) !== chapter.approvalStamp) {
      return {ok:false, reason:'unapproved-or-mutated'};
    }
    try {
      if (JSON.stringify(keywordsOf(chapter.keywords)) !== JSON.stringify(chapter.keywords)) {
        return {ok:false,reason:'invalid-keywords'};
      }
      const names = knownBy(chapter.known_by);
      if (JSON.stringify(names) !== JSON.stringify(chapter.known_by) ||
          (chapter.knowledge_scope === 'actors' && !names.length) ||
          (chapter.knowledge_scope !== 'actors' && names.length)) return {ok:false,reason:'invalid-audience'};
      const source = proof(messages, chapter.source.start, chapter.source.end);
      if (chapter.id !== 'chapter-' + source.start + '-' + source.end + '-' + fingerprint(source.signature) ||
          JSON.stringify(source) !== JSON.stringify(chapter.source)) return {ok:false,reason:'stale-source'};
    } catch (_) { return {ok:false,reason:'stale-source'}; }
    return {ok:true,reason:'verified'};
  };
  const approve = (draft, {messages, knowledge_scope, known_by = [], state, resolver} = {}) => {
    if (!isObject(draft) || draft.version !== VERSION || draft.approved !== false ||
        draft.knowledge_scope !== 'pending' || draft.approvalStamp ||
        !['shared','actors','exclude'].includes(knowledge_scope)) {
      throw Error('請先建立章節草稿並明確確認知情範圍。');
    }
    const source = proof(messages, draft.source?.start, draft.source?.end);
    if (draft.id !== 'chapter-' + source.start + '-' + source.end + '-' + fingerprint(source.signature) ||
        JSON.stringify(source) !== JSON.stringify(draft.source) ||
        typeof draft.text !== 'string' || !draft.text.trim() || draft.text.length > 2000) {
      throw Error('章節草稿或原文來源已改變，無法核准。');
    }
    const keywords = keywordsOf(draft.keywords), people = knownBy(known_by);
    if (knowledge_scope === 'actors') {
      if (!people.length || !resolver?.resolveActor) throw Error('私人章節需要明確且可核對的角色知情名單。');
      for (let i = 0; i < people.length; i++) {
        const name = resolver.resolveActor(state, people[i]);
        if (typeof name !== 'string' || !name.trim()) throw Error('角色名稱有歧義，章節未核准。');
        people[i] = name;
      }
    } else if (people.length) throw Error('共享或排除章節不可同時指定私人角色名單。');
    const approved = {...draft, keywords, approved:true, knowledge_scope,
      known_by:[...new Set(people)]};
    approved.approvalStamp = stampFor(approved);
    if (!check(approved, messages).ok) throw Error('章節核准前驗證失敗。');
    return approved;
  };
  const upsert = (archive, chapter, messages) => {
    if (!check(chapter,messages).ok) throw Error('無法儲存未核准或來源失效的章節。');
    const previous = Array.isArray(archive?.chapters) ? archive.chapters : [];
    if (previous.length >= MAX_CHAPTERS && !previous.some(entry => entry?.id === chapter.id)) {
      throw Error('章節索引已達 200 章容量；不得靜默刪除舊章節。');
    }
    if (previous.some(entry => entry?.id !== chapter.id && isObject(entry?.source) &&
       chapter.source.start < entry.source.end && entry.source.start < chapter.source.end)) {
      throw Error('章節來源範圍重疊，請先檢查分界。');
    }
    const chapters = previous.filter(entry => entry?.id !== chapter.id).concat({...chapter,
      source:{...chapter.source}, keywords:[...chapter.keywords],known_by:[...chapter.known_by]})
      .sort((a,b) => a.source.start-b.source.start);
    return {version:VERSION, chapters};
  };
  const tokens = input => {
    const str = String(input || '').toLowerCase();
    const words = str.match(/[a-z0-9_]{2,}/g) || [];
    for (const segment of str.match(/[\u3400-\u9fff]{2,}/g) || []) {
      words.push(segment);
      for (let i = 0; i < segment.length-1; i++) words.push(segment.slice(i,i+2));
    }
    return [...new Set(words)].slice(0,120);
  };
  const recall = ({archive,messages,query='',state,config,primary='',resolver,maxChars=1600,maxEntries=2}={}) => {
    const chapters = Array.isArray(archive?.chapters) ? archive.chapters : [];
    const queryTerms = tokens(query);
    if (!queryTerms.length || !Array.isArray(messages)) return {text:'',selected:[],invalid:0};
    const limit = Math.max(200,Math.min(4000,Math.floor(Number(maxChars)||1600)));
    const entriesLimit = Math.max(1,Math.min(3,Math.floor(Number(maxEntries)||2)));
    // Derive the real scene audience from the same resolver as episodic memory;
    // callers must not claim a smaller cast to bypass private NPC knowledge.
    const audience = resolver?.audience?.({state,config,primary}) || [];
    let invalid = 0;
    const scored=[];
    for(const chapter of chapters.slice(0,MAX_CHAPTERS)){
      if(!check(chapter,messages).ok){invalid++;continue;}
      if(chapter.knowledge_scope === 'exclude') continue;
      if(chapter.knowledge_scope === 'actors' &&
          (!resolver?.canRead || !Array.isArray(audience) || !audience.length ||
           !resolver.canRead(chapter,audience,state))) continue;
      const key = chapter.keywords.join(' ').toLowerCase();
      const body = chapter.text.toLowerCase();
      const score = queryTerms.reduce((total,word) =>
        total + (key.includes(word) ? 5 : 0) + (body.includes(word) ? 1 : 0),0);
      if (score) scored.push({chapter,score});
    }
    scored.sort((a,b) => b.score-a.score || b.chapter.source.end-a.chapter.source.end);
    const selected = [], blocks = [];
    const header = '【有來源的章節回憶｜僅供核對，不代表所有角色都知道】';
    let chars = header.length;
    for(const {chapter} of scored){
      if(selected.length>=entriesLimit)break;
      const block = '\n【'+chapter.id+'】\n'+chapter.text;
      if(chars+block.length>limit) continue; // Never truncate a verified claim.
      blocks.push(block); selected.push({id:chapter.id,source:{...chapter.source}});
      chars+=block.length;
    }
    return {text:selected.length?header+blocks.join(''):'',selected,invalid};
  };
  const audit = (archive,messages) => {
    const entries = Array.isArray(archive?.chapters) ? archive.chapters : [];
    return entries.map(entry => ({id:String(entry?.id||''),...check(entry,messages)}));
  };
  return Object.freeze({VERSION,MAX_SOURCE_MESSAGES,MAX_CHAPTERS,
    proof,createDraft,approve,check,upsert,recall,audit});
});

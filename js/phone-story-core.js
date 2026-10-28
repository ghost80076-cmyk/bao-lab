/* Pure phone event extraction and story-owned append-only update. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./phone-ui-core.js') : root?.BAOPhoneUICore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOPhoneStoryCore = api;
})(typeof window !== 'undefined' ? window : null, function(PhoneCore) {
  'use strict';
  const OPEN = '[[YORUBAY_PHONE_V1]]';
  const CLOSE = '[[/YORUBAY_PHONE_V1]]';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const LIMIT = 8192;
  const empty = () => ({ version:1, contacts:[], threads:[], photos:[], notes:[], storyTime:'', storyDate:'', chat:[], tweets:[], calls:[], events:[], instagram:{messages:[]}, seenIds:[] });
  const safeEvents = list => Array.isArray(list) ? list.slice(0, 3).filter(object).map(item => ({
    time: String(item.time ?? '').slice(0,24),
    title: String(item.title ?? '').slice(0,120)
  })).filter(item => item.title.trim()) : [];
  function normalizePatch(raw) {
    if (!PhoneCore || !object(raw) || raw.version && raw.version !== 1) return null;
    const patch = {};
    const normalized = PhoneCore.normalize(raw);
    if (!normalized) return null;
    for (const key of ['contacts','threads','photos','notes']) {
      if (Array.isArray(raw[key])) patch[key] = normalized[key].slice(0,3);
    }
    if (patch.threads) patch.threads = patch.threads.map(item => {
      const source = raw.threads.find(thread => String(thread?.id ?? '').trim().slice(0,80) === item.id) || {};
      const next = {...item, messages:item.messages.slice(0,5)};
      for (const key of ['name','participants']) if (!(key in source)) delete next[key];
      return next;
    });
    for (const key of ['storyTime','storyDate']) if (normalized[key].trim()) patch[key] = normalized[key];
    if (Array.isArray(raw.chat)) patch.chat = PhoneCore.normalize({chat:raw.chat}).chat.slice(0,5).filter(item => item.text.trim());
    if (Array.isArray(raw.tweets)) patch.tweets = PhoneCore.normalize({tweets:raw.tweets}).tweets.slice(0,3).filter(item => item.text.trim());
    if (Array.isArray(raw.calls)) patch.calls = PhoneCore.normalize({calls:raw.calls}).calls.slice(0,3).filter(item => item.items.length);
    if (Array.isArray(raw.events)) patch.events = safeEvents(raw.events);
    if (object(raw.instagram) && Array.isArray(raw.instagram.messages)) {
      patch.instagram = {messages:PhoneCore.normalize({instagram:{messages:raw.instagram.messages}}).instagram.messages.slice(0,4).filter(item=>item.text.trim())};
    }
    if (!Object.values(patch).some(x => typeof x === 'string' ? x.length : Array.isArray(x) ? x.length : x?.messages?.length)) return null;
    return patch;
  }
  function extract(text) {
    const source = String(text ?? '');
    const start = source.lastIndexOf(OPEN);
    if (start < 0 || source.length-start > LIMIT + OPEN.length + CLOSE.length + 8) return {text:source, patch:null};
    const after = source.slice(start + OPEN.length);
    const end = after.indexOf(CLOSE);
    if (end < 0 || after.slice(end + CLOSE.length).trim()) return {text:source, patch:null};
    let raw;
    try { raw = JSON.parse(after.slice(0,end).trim()); }
    catch (_) { return {text:source, patch:null}; }
    const patch = normalizePatch(raw);
    if (!patch) return {text:source, patch:null};
    const clean = source.slice(0,start).trimEnd();
    return {text:clean || '（手機收到新動態）', patch};
  }
  const bound = (list,max) => Array.isArray(list) ? list.slice(-max) : [];
  // Notifications are derived from accepted story updates, never authored by a second model.
  const noticeApps = ['kakao','x','phone','instagram','photos','notes'];
  function notifications(overlay) {
    if (!object(overlay) || overlay.version !== 1) return [];
    return bound(overlay.notifications,40).filter(item => object(item) && noticeApps.includes(item.app) && typeof item.id === 'string').map(item => ({
      id:item.id.slice(0,220), app:item.app, targetId:String(item.targetId || '').slice(0,80),
      label:String(item.label || '新動態').slice(0,100), read:item.read === true
    }));
  }
  function newNotifications(patch, sourceId) {
    const items=[];
    const add=(app,targetId,label)=>items.push({id:sourceId+':'+app+':'+targetId,app,targetId,label:String(label).slice(0,100),read:false});
    if (patch.chat?.some(item=>item.from !== 'me')) add('kakao','','收到新的手機訊息');
    for (const thread of patch.threads || []) if (thread.messages.some(item=>item.from !== 'me')) add('kakao',thread.id,'聊天室有新訊息');
    if (patch.tweets?.length) add('x','','有新的貼文');
    if (patch.calls?.length) add('phone','','通話紀錄已更新');
    // Instagram currently presents scripted video overlays, not an inbox.
    // Overlay captions must not imply a new incoming call or message.
    for (const item of patch.photos || []) add('photos',item.id,'收到新的照片');
    for (const item of patch.notes || []) add('notes',item.id,'筆記已更新');
    return items;
  }
  function apply(state, patch, messageId) {
    if (!object(state) || !patch || !object(patch)) return false;
    patch = normalizePatch(patch);
    if (!patch) return false;
    const id=String(messageId || '').slice(0,120);
    if (!id) return false;
    const prior = object(state.phoneUI) && state.phoneUI.version===1 ? state.phoneUI : empty();
    const seenIds = bound(prior.seenIds,60);
    if (seenIds.includes(id)) return false;
    const result = empty();
    result.seenIds = bound([...seenIds,id],60);
    result.notifications = bound([...notifications(prior),...newNotifications(patch,id)],40);
    for (const [key,max] of [['chat',150],['tweets',80],['calls',25],['events',8]]) {
      result[key] = bound([...(Array.isArray(prior[key]) ? prior[key] : []), ...(Array.isArray(patch[key]) ? patch[key] : [])],max);
    }
    result.instagram.messages = bound([
      ...(Array.isArray(prior.instagram?.messages) ? prior.instagram.messages : []),
      ...(Array.isArray(patch.instagram?.messages) ? patch.instagram.messages : [])
    ],80);
    for (const [key,max] of [['contacts',30],['threads',30],['photos',80],['notes',80]]) {
      result[key] = PhoneCore.mergeRecords(prior[key],patch[key],max,key==='threads');
    }
    for (const key of ['storyTime','storyDate']) result[key] = patch[key] || prior[key] || '';
    state.phoneUI = result;
    return true;
  }
  function mergeDisplay(card, overlay) {
    const base = PhoneCore?.normalize(card);
    if (!base || !object(overlay) || overlay.version!==1) return base;
    const input = {
      ...base,
      chat:bound([...base.chat,...(Array.isArray(overlay.chat)?overlay.chat:[])],150),
      tweets:bound([...base.tweets,...(Array.isArray(overlay.tweets)?overlay.tweets:[])],80),
      calls:bound([...base.calls,...(Array.isArray(overlay.calls)?overlay.calls:[])],25),
      events:bound([...base.events,...(Array.isArray(overlay.events)?overlay.events:[])],8),
      instagram:{...base.instagram,messages:bound([
        ...base.instagram.messages,...(Array.isArray(overlay.instagram?.messages)?overlay.instagram.messages:[])
      ],80)}
    };
    for (const [key,max] of [['contacts',30],['threads',30],['photos',80],['notes',80]]) {
      input[key] = PhoneCore.mergeRecords(base[key],overlay[key],max,key==='threads');
    }
    for (const key of ['storyTime','storyDate']) input[key] = overlay[key] || base[key];
    return PhoneCore.normalize(input);
  }
  const PROMPT = [
    '【作品手機動態（僅此卡啟用）】',
    '手機 UI 是既有故事的呈現方式，不是新世界。不得為了更新手機而增加事件密度、讓 NPC 全知，或代玩家編造未說過的話。',
    '只有本輪故事確實產生此手機主人可合理看見的新訊息、通話、貼文或日程時，才在故事正文結束後附加一次下列資料區塊；沒有變動時絕對不要輸出。',
    OPEN,
    '{"chat":[{"from":"them","time":"23:41","text":"..."}],"tweets":[{"text":"...","date":"今天"}],"calls":[{"group":"今天","items":[{"name":"...","type":"未接","time":"23:40","count":"1"}]}],"events":[{"time":"明天","title":"..."}],"instagram":{"messages":[{"from":"them","text":"...","delay":0}]}}',
    CLOSE,
    '可選擴充：contacts:[{id,name,avatar}]；threads:[{id,name,participants:[聯絡人ID],messages:[{from,senderId,time,text}]}]；photos:[{id,src,title,caption}]；notes:[{id,title,text}]；storyTime、storyDate 為故事內顯示時間與日期。',
    '以上欄位同樣放進該 JSON 區塊。沿用人物覆寫中的 ID；多人或群聊請用 threads，勿混入主要聯絡人的 chat。新聊天室須提供 name 與 participants；既有聊天室只附新訊息。照片與筆記依 ID 更新，照片只能使用故事已提供的真實圖片網址，不得編造網址。照片與筆記只屬於手機主人可取得的資料。',
    '只保留真正新增的欄位和紀錄；不要重複既有內容。上述是 JSON 格式範例，不是實際事件。from=me 只能記錄玩家明確提供過的訊息。區塊外照常寫故事，且不要附任何 HTML/JavaScript。'
  ].join('\n');
  return Object.freeze({OPEN,CLOSE,extract,normalizePatch,apply,mergeDisplay,notifications,empty,PROMPT});
});

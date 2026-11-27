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
    const offer = raw.photoOffer;
    if (object(offer) && typeof offer.description === 'string' && offer.description.trim()
        && typeof offer.threadId === 'string' && offer.threadId.length <= 80) {
      patch.photoOffer = {threadId:offer.threadId.trim(), description:offer.description.trim().slice(0,600),
        kind:offer.kind === 'selfie' ? 'selfie' : 'scene',
        ...(typeof offer.senderId === 'string' && offer.senderId.trim() && offer.senderId.length <= 80 ? {senderId:offer.senderId.trim()} : {})};
    }
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
    if (Array.isArray(raw.tweets)) patch.tweets = PhoneCore.normalize({tweets:raw.tweets}).tweets.slice(0,3)
      .map((tweet,index) => ({...tweet,
        // Missing IDs receive a stable message-owned ID at apply-time.
        id:raw.tweets[index] && typeof raw.tweets[index] === 'object' && raw.tweets[index].id ? tweet.id : ''
      })).filter(item => item.text.trim());
    const xOffer=raw.xPhotoOffer;
    if (object(xOffer) && typeof xOffer.postId==='string' && xOffer.postId.length<=80 &&
        typeof xOffer.senderId==='string' && xOffer.senderId.length<=80 && xOffer.senderId.trim() &&
        typeof xOffer.description==='string' && xOffer.description.trim()) {
      const matches=(patch.tweets || []).filter(t=>t.id===xOffer.postId && t.from==='them' && t.authorId===xOffer.senderId);
      if(matches.length===1 && patch.tweets.filter(t=>t.id===xOffer.postId).length===1)
        patch.xPhotoOffer={postId:xOffer.postId,senderId:xOffer.senderId,kind:xOffer.kind==='selfie'?'selfie':'scene',description:xOffer.description.trim().slice(0,600)};
    }
    if (Array.isArray(raw.calls)) patch.calls = PhoneCore.normalize({calls:raw.calls}).calls.slice(0,3).filter(item => item.items.length);
    if (Array.isArray(raw.events)) patch.events = safeEvents(raw.events);
    if (object(raw.instagram) && Array.isArray(raw.instagram.messages)) {
      patch.instagram = {messages:PhoneCore.normalize({instagram:{messages:raw.instagram.messages}}).instagram.messages.slice(0,4).filter(item=>item.text.trim())};
    }
    if (!patch.photoOffer && !Object.values(patch).some(x => typeof x === 'string' ? x.length : Array.isArray(x) ? x.length : x?.messages?.length)) return null;
    return patch;
  }
  // A native private/group audio reply may update only its original recipient.
  // Do not trust model-generated membership, public posts or player messages.
  function restrictVoiceReply(patch,scope){
    if(!patch||!scope||typeof scope.id!=='string'||!Array.isArray(scope.members)||!scope.members.length)return null;
    const members=new Set(scope.members);
    const replies=messages=>(messages||[]).filter(m=>m.from==='them'&&m.text?.trim()&&(members.has(m.senderId)||(!m.senderId&&members.size===1)))
      .map(m=>({...m,senderId:m.senderId||scope.members[0]}));
    if(!scope.id){const chat=replies(patch.chat);return chat.length?{chat}:null;}
    const messages=(patch.threads||[]).filter(t=>t.id===scope.id).flatMap(t=>replies(t.messages)).slice(0,5);
    return messages.length?{threads:[{id:scope.id,messages}]}:null;
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
    if (patch.tweets?.some(tweet => tweet.from !== 'me')) add('x','','有新的貼文或回覆');
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
    for (const [key,max] of [['chat',150],['calls',25],['events',8]]) {
      result[key] = bound([...(Array.isArray(prior[key]) ? prior[key] : []), ...(Array.isArray(patch[key]) ? patch[key] : [])],max);
    }
    const sourceKey = id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48) || 'message';
    result.tweets = bound([...(Array.isArray(prior.tweets) ? prior.tweets : []),
      ...(patch.tweets || []).map((tweet,index) => ({
        ...tweet, id:tweet.id || 'turn-' + sourceKey + '-' + index
      }))],80);
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
  // Group media is scoped to the exact set of participants at the addressed turn.
  // No group photo can be inferred from a legacy text-only or one-to-one prefix.
  function groupPhotoTarget(thread, name, contacts=[]) {
    if (!thread?.id || !Array.isArray(thread.participants)) return null;
    const members = [...new Set(thread.participants)].sort();
    if (members.length < 2 || members.length > 30 ||
        members.some(id=>typeof id !== 'string' || !id || id.length>80)) return null;
    const threadId=thread.id, key=JSON.stringify(['group',threadId,members]);
    if(key.length>3000)return null; // fail closed rather than truncate an audience key
    const prefix='【KakaoTalk｜對 '+name+' 發送訊息｜聊天室 ID：'+threadId+'｜群聊成員 ID：'+JSON.stringify(members)+'】';
    return {group:true,threadId,name,members,key,prefix,
      audience:members.map(id=>contacts.find(c=>c.id===id)?.name || id).join('、'),
      memberNames:Object.fromEntries(members.map(id=>[id,contacts.find(c=>c.id===id)?.name || id]))};
  }
  function groupPhotoExchanges(messages,target) {
    if(!target?.group)return [];
    const rows=[];let addressed=false,sent=null;
    for(const message of messages || []){
      if(message.role==='user'){
        addressed=typeof message.content==='string' && message.content.startsWith(target.prefix);
        sent=addressed && message.storyImage ? {message,image:message.storyImage} : null;
        if(sent)rows.push(sent);
      }else if(message.role==='assistant' && addressed){
        const selected=message.variants?.[message.activeVariant || 0];
        const patch=normalizePatch(selected ? selected.phonePatch : message.phonePatch);
        const thread=patch?.threads?.find(t=>t.id===target.threadId);
        const validMembership=!thread?.participants || JSON.stringify([...new Set(thread.participants)].sort())===JSON.stringify(target.members);
        const replies=validMembership ? (thread?.messages || []).filter(m=>m.from!=='me' && m.text.trim() && target.members.includes(m.senderId)) : [];
        const anchor=reply=>reply && {messageId:message.id,text:reply.text,senderId:reply.senderId};
        if(sent)sent.anchor=anchor(replies.at(-1));
        const offer=patch?.photoOffer;
        const reply=offer?.threadId===target.threadId && replies.findLast(m=>m.senderId===offer.senderId);
        if(reply)rows.push({message,offer,anchor:anchor(reply),senderId:offer.senderId,
          signature:JSON.stringify([offer.senderId,offer.kind,offer.description])});
        addressed=false;sent=null;
      }
    }
    return rows;
  }
  // Public X photos are never inferred from DM/group attachments, galleries,
  // or arbitrary image URLs in a model patch. An explicit player action owns its ID.
  const xIdPattern=/^player-x-[a-f0-9-]{36}$/;
  function xPublishPrefix(id,replyTo='') {
    if(!xIdPattern.test(id) || typeof replyTo!=='string' || replyTo.length>80)return '';
    try{return '【X｜公開發佈｜貼文 ID：'+id+'｜回覆 ID：'+encodeURIComponent(replyTo)+'】';}catch(_){return '';}
  }
  function xPlayerIntent(message) {
    if(message?.role!=='user' || typeof message.content!=='string')return null;
    const m=/^【X｜公開發佈｜貼文 ID：(player-x-[a-f0-9-]{36})｜回覆 ID：([^】]*)】([\s\S]+)$/.exec(message.content);
    if(!m)return null;
    try{
      const replyTo=decodeURIComponent(m[2]),text=m[3].trim();
      if(!text || text.length>1200 || message.content!==xPublishPrefix(m[1],replyTo)+m[3])return null;
      return {id:m[1],replyTo,text,from:'me'};
    }catch(_){return null;}
  }
  function xPublicPost(tweets,id,allowed=()=>true) {
    const seen=new Set();let next=id,post=null;
    while(next){
      if(seen.has(next) || seen.size>=80)return null;
      seen.add(next);
      const found=(tweets || []).filter(t=>t.id===next);
      if(found.length!==1 || !allowed(next))return null;
      if(!post)post=found[0];
      next=found[0].replyTo;
    }
    return post;
  }
  function withXPlayerPost(patch,user,tweets,allowed) {
    const intent=xPlayerIntent(user);
    if(!intent)return patch;
    // Even if the target disappeared or locked during the request, never let
    // the model's echo bypass the platform's explicit-publication gate.
    const other=(patch?.tweets || []).filter(t=>t.id!==intent.id && t.from!=='me').slice(0,2);
    if((tweets || []).some(t=>t.id===intent.id) ||
       (intent.replyTo && !xPublicPost(tweets,intent.replyTo,allowed)))
      return patch ? normalizePatch({...patch,tweets:other}) : null;
    return normalizePatch({...patch,tweets:[intent,...other]});
  }
  const xFingerprint=t=>JSON.stringify([t.id,t.replyTo || '',t.from,t.authorId || '',t.text]);
  function xPhotoRows(messages,tweets,allowed=()=>true) {
    const rows=[];let user=null;
    for(const message of messages || []){
      if(message.role==='user'){user=message;continue;}
      if(message.role!=='assistant' || !user)continue;
      const preceding=user;user=null;
      const selected=message.variants?.[message.activeVariant || 0];
      const patch=normalizePatch(selected ? selected.phonePatch : message.phonePatch);
      if(!patch)continue;
      const intent=xPlayerIntent(preceding);
      const match=t=>{
        const live=t && xPublicPost(tweets,t.id,allowed);
        return live && xFingerprint(live)===xFingerprint(t);
      };
      if(intent && preceding.storyImage){
        const post=patch.tweets?.find(t=>t.id===intent.id && t.from==='me' && !t.authorId && t.replyTo===intent.replyTo && t.text===intent.text);
        if(match(post))rows.push({postId:post.id,message,image:preceding.storyImage,signature:xFingerprint(post)});
      }
      // Do not make a private/phone turn into a public photo offer. Ordinary
      // story turns with a player image are excluded too unless explicitly X.
      const content=typeof preceding.content==='string'?preceding.content.trim():'';
      if(/^【(?:KakaoTalk|Instagram)/.test(content) ||
         (preceding.storyImage && !intent))continue;
      const offer=patch.xPhotoOffer;
      const post=offer && patch.tweets?.find(t=>t.id===offer.postId && t.authorId===offer.senderId && t.from==='them');
      if(match(post)){
        const signature=JSON.stringify([xFingerprint(post),offer.senderId,offer.kind,offer.description]);
        if(signature.length<=4500)rows.push({postId:post.id,message,offer,senderId:offer.senderId,key:JSON.stringify(['x',post.id]),signature});
      }
    }
    return rows;
  }
  const PROMPT = [
    '【作品手機動態（僅此卡啟用）】',
    '手機 UI 是既有故事的呈現方式，不是新世界。不得為了更新手機而增加事件密度、讓 NPC 全知，或代玩家編造未說過的話。',
    '只有本輪故事確實產生此手機主人可合理看見的新訊息、通話、貼文或日程時，才在故事正文結束後附加一次下列資料區塊；沒有變動時絕對不要輸出。',
    OPEN,
    '{"chat":[{"from":"them","time":"23:41","text":"..."}],"tweets":[{"id":"school-event-1","authorId":"npc-a","authorName":"某同學","authorHandle":"@someone","text":"...","date":"今天","eventId":"已知事件ID","sourceKind":"hearsay"},{"id":"school-reply-1","replyTo":"school-event-1","authorId":"npc-b","authorName":"另一位同學","text":"我看到的不是這樣","date":"今天"}],"calls":[{"group":"今天","items":[{"name":"...","type":"未接","time":"23:40","count":"1"}]}],"events":[{"time":"明天","title":"..."}],"instagram":{"messages":[{"from":"them","text":"...","delay":0}]}}',
    CLOSE,
    '可選擴充：contacts:[{id,name,avatar}]；threads:[{id,name,participants:[聯絡人ID],messages:[{from,senderId,time,text}]}]；photos:[{id,src,title,caption}]；notes:[{id,title,text}]；storyTime、storyDate 為故事內顯示時間與日期。',
    '以上欄位同樣放進該 JSON 區塊。沿用人物覆寫中的 ID；多人或群聊請用 threads，勿混入主要聯絡人的 chat。新聊天室須提供 name 與 participants；既有聊天室只附新訊息。照片與筆記依 ID 更新，照片只能使用故事已提供的真實圖片網址，不得編造網址。照片與筆記只屬於手機主人可取得的資料。',
    '收到一對一 KakaoTalk 私訊時，角色若以私訊回覆，將回覆文字放在同一個 chat 或 threads 的 messages。偶爾可隨角色意願在同一區塊附 photoOffer:{threadId:"聊天室 ID（主要聯絡人填空字串）",kind:"scene 或 selfie",description:"角色想分享的具體畫面"}。只在玩家正在私訊該角色且自然適合時提議，不必每輪提供。提議尚未傳送照片，不得描寫已收到、看到或分享；玩家傳來的私訊圖片只有該私訊對象可見。',
    '收到含「群聊成員 ID」的 KakaoTalk 群聊訊息時，附件只屬於該聊天室及所列成員，不可透露給其他聊天室、X 或未列出的 NPC。若群內某成員自然想分享照片，photoOffer 必須填同一 threadId、senderId（必須是列出的成員 ID）、kind、description，並在該 threads.messages 中提供同一 senderId 的實際回覆。最多一個提議，不需每輪提供；未確認送達前不可敘述已分享。群組成員變更不代表新成員已看到先前照片。',
    'X 的 tweets 使用 id 指向貼文，replyTo 引用已存在的貼文 ID 即為留言；每個 NPC 可有各自的 authorId、authorName、authorHandle。eventId 僅引用故事已確認的事件 ID；sourceKind 可用 witness/media/hearsay/unknown，沒有根據就省略。不可讓角色知道沒接觸過的私密事件、不可把傳聞當成事實，也不必讓所有貼文圍繞玩家。舊版只有 text/date/replies 數字的貼文仍有效。',
    '收到【X｜公開發佈｜貼文 ID：…｜回覆 ID：…】時，這是玩家明確選擇故事內公開的貼文或留言，只有這次傳送的附件可作為公開照片。玩家貼文 ID、文字與 replyTo 由夜灣記錄；模型只需提供其他 NPC 的合理反應，不要再代玩家發文。不要把私訊、群聊、收藏相簿或未公開的照片帶入 X。',
    'NPC 可偶爾提出公開照片：同一區塊的 tweets 必須含明確 id、authorId、文字及必要 replyTo；另填 xPhotoOffer:{postId:"該貼文 ID",senderId:"相同 authorId",kind:"scene 或 selfie",description:"公開照片的具體畫面"}。只限公開、來源合理的貼文，不在私訊／群聊／視訊回合提出，不每輪提出，未經玩家確認生成及發布前不能敘述照片已公開或被看見。不得使用相簿 ID、私訊 ID 或編造照片網址。每輪最多一張提議。',
    '只保留真正新增的欄位和紀錄；不要重複既有內容。上述是 JSON 格式範例，不是實際事件。X 的 from=me 和聊天 from=me 都只能記錄玩家明確提供過的訊息；玩家在 X 發送的回覆須依所給的貼文 ID、內容建立對應 replyTo，不能偽造玩家發言。區塊外照常寫故事，且不要附任何 HTML/JavaScript。'
  ].join('\n');
  return Object.freeze({OPEN,CLOSE,extract,normalizePatch,restrictVoiceReply,apply,mergeDisplay,notifications,empty,PROMPT,groupPhotoTarget,groupPhotoExchanges,xPublishPrefix,xPlayerIntent,xPublicPost,withXPlayerPost,xPhotoRows});
});

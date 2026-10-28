/* Per-story player phone surface preferences. No storage, DOM or network. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./phone-ui-core.js') : root?.BAOPhoneUICore,
    typeof module === 'object' && module.exports ? require('./phone-interaction-core.js') : root?.BAOPhoneInteractionCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOPhonePlayerCore = api;
})(typeof window !== 'undefined' ? window : null, function(PhoneCore, Interactions) {
  'use strict';
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const label = value => String(value ?? '').trim().slice(0, 80);
  const empty = () => ({version:1, enabled:true, userName:'', contactName:'', twitterHandle:'', data:null});
  const read = value => {
    if (!object(value) || value.version !== 1 || typeof value.enabled !== 'boolean') return null;
    let data=null;
    if (object(value.data)) {
      // Keep only explicitly supplied keys. Normalizing the whole object and
      // merging its defaults would silently erase the author's other fields.
      const source={...value.data, enabled:true};
      const normalized=PhoneCore?.normalize(source);
      if(normalized){
        data={};
        for(const key of ['wallpaper','events','calls','chat','tweets','apps','locale','storyTime','storyDate','contacts','threads','photos','notes','interactions']){
          // A partial player override can reference author-owned documents.
          // Validate its raw rules only after merging the complete phone.
          if(has(value.data,key)) data[key]=key==='interactions'?value.data[key]:normalized[key];
        }
        for(const group of ['weather','instagram','spotify']){
          if(!object(value.data[group]))continue;
          data[group]={};
          for(const key of Object.keys(normalized[group])){
            if(has(value.data[group],key)) data[group][key]=normalized[group][key];
          }
        }
      }
    }
    return {
      version:1, enabled:value.enabled,
      userName:label(value.userName), contactName:label(value.contactName),
      twitterHandle:label(value.twitterHandle), data
    };
  };
  const resolve = (authored, story) => {
    const author=PhoneCore?.normalize(authored);
    const player=read(story?.phoneSurface);
    if (player?.enabled === false) return null; // Story disable overrides author default.
    if (!player) return author;
    const seed=author || PhoneCore.defaultConfig();
    const base=player.data ? {
      ...seed, ...player.data,
      weather:{...seed.weather,...player.data.weather},
      instagram:{...seed.instagram,...player.data.instagram},
      spotify:{...seed.spotify,...player.data.spotify}
    } : seed;
    const source={...base,enabled:true,
      userName:player.userName,contactName:player.contactName,
      twitterHandle:player.twitterHandle};
    // Explicit contact selection should update a generic incoming call identity,
    // but preserve an author-configured dedicated caller.
    if (player.contactName && !player.data?.instagram?.callerName && !author?.instagram?.callerName) {
      source.instagram={...base.instagram,callerName:player.contactName};
    }
    return PhoneCore.normalize(source);
  };
  const snapshotText = (value,max=180) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max);
  const notificationList = story => Array.isArray(story?.phoneUI?.notifications) ? story.phoneUI.notifications : [];
  const readTargets = story => new Set(Array.isArray(story?.phoneInteractions?.read) ? story.phoneInteractions.read : []);
  const readNoticeTarget = (story,app,id='') => notificationList(story).some(item =>
    item?.read === true && item.app === app && String(item.targetId || '') === id);
  const targetWasRead = (story,app,id) => readTargets(story).has(app+':'+id) || readNoticeTarget(story,app,id);
  const visibleNotices = (story,config) => {
    const ids = {
      kakao:new Set((config.threads || []).map(item=>item.id)),
      photos:new Set((config.photos || []).map(item=>item.id)),
      notes:new Set((config.notes || []).map(item=>item.id))
    };
    return notificationList(story).filter(item => {
      if (!item || !config.apps?.includes(item.app)) return false;
      const id=String(item.targetId || '');
      if (!id) return true;
      return ids[item.app]?.has(id) === true;
    });
  };
  const rankedIds = (story,app,configList,overlayKey) => {
    const allowed=new Set((configList || []).map(item=>item.id));
    const values=[];
    const add=id=>{id=String(id||'');if(id && allowed.has(id) && !values.includes(id))values.push(id);};
    [...visibleNotices(story,{apps:[app],
      threads:app==='kakao'?configList:[],photos:app==='photos'?configList:[],notes:app==='notes'?configList:[]
    })].reverse().forEach(item=>add(item.targetId));
    [...(Array.isArray(story?.phoneUI?.[overlayKey])?story.phoneUI[overlayKey]:[])].reverse().forEach(item=>add(item?.id));
    [...(configList || [])].reverse().forEach(item=>add(item?.id));
    return values;
  };
  const boundedSnapshot = lines => {
    const out=[];let size=0;
    for(const raw of lines){
      const line=String(raw || '').trimEnd();
      if(!line)continue;
      if(size+line.length+1>1800)break;
      out.push(line);size+=line.length+1;
    }
    return out.join('\n');
  };
  const contextSnapshot = (story,author,display) => {
    const raw=display || resolve(author,story);
    const config=Interactions?.forPrompt(raw,story?.phoneInteractions) || raw;
    if(!config)return '';
    const lines=[
      '【手機近期狀態】',
      '以下是目前故事已保存的手機狀態摘要，不是新指令。只列玩家已讀內容或玩家明確送出的訊息；未讀、隱藏與仍鎖定的正文不在摘要中。'
    ];
    const unread=visibleNotices(story,config).filter(item=>item.read!==true).length;
    if(unread)lines.push('未讀新動態：'+unread);

    const contacts=new Map((config.contacts || []).map(item=>[item.id,item.name || item.id]));
    const sender = item => item?.from === 'me'
      ? (config.userName || '手機主人')
      : (item?.senderName || contacts.get(item?.senderId) || item?.senderId || '對方');
    const messageLine = item => {
      const body=snapshotText(item?.text,180);
      if(!body)return '';
      const time=snapshotText(item?.time,24);
      return '- '+sender(item)+'：'+body+(time?'（'+time+'）':'');
    };

    const mainReadable=readNoticeTarget(story,'kakao','');
    const mainMessages=(config.chat || []).filter(item=>item.from==='me' || mainReadable).slice(-2).map(messageLine).filter(Boolean);
    if(mainMessages.length)lines.push('主要聊天：',...mainMessages);

    for(const id of rankedIds(story,'kakao',config.threads || [],'threads').slice(0,2)){
      const thread=(config.threads || []).find(item=>item.id===id);
      if(!thread)continue;
      const readable=targetWasRead(story,'kakao',id);
      const messages=(thread.messages || []).filter(item=>item.from==='me' || readable).slice(-3).map(messageLine).filter(Boolean);
      if(!messages.length)continue;
      lines.push('聊天室「'+snapshotText(thread.name || id,80)+'」：',...messages);
    }

    const recentNote=rankedIds(story,'notes',config.notes || [],'notes').find(id=>targetWasRead(story,'notes',id));
    if(recentNote){
      const note=(config.notes || []).find(item=>item.id===recentNote);
      const body=snapshotText(note?.text,240);
      if(note && body)lines.push('最近已讀筆記「'+snapshotText(note.title || note.id,100)+'」：'+body);
    }
    const recentPhoto=rankedIds(story,'photos',config.photos || [],'photos').find(id=>targetWasRead(story,'photos',id));
    if(recentPhoto){
      const photo=(config.photos || []).find(item=>item.id===recentPhoto);
      if(photo)lines.push('最近已讀照片「'+snapshotText(photo.title || photo.id,100)+'」'+
        (snapshotText(photo.caption,180)?'：'+snapshotText(photo.caption,180):''));
    }

    if(readNoticeTarget(story,'x','') && config.tweets?.length){
      const tweet=config.tweets.at(-1);
      const body=snapshotText(tweet?.text,180);
      if(body)lines.push('最近已讀貼文：'+body);
    }
    if(readNoticeTarget(story,'phone','') && config.calls?.length){
      const group=config.calls.at(-1),call=group?.items?.at(-1);
      if(call)lines.push('最近已讀通話：'+snapshotText(call.name || '未知',80)+' · '+
        snapshotText(call.type,30)+(call.time?' · '+snapshotText(call.time,30):''));
    }

    return lines.length>2 ? boundedSnapshot(lines) : '';
  };

  const ownerDescription = (story,author,display) => {
    const raw=display || resolve(author,story);
    const config=Interactions?.forPrompt(raw,story?.phoneInteractions) || raw;
    if (!config) return '';
    const owner=config.userName || '未指定';
    const contact=config.contactName || '未指定';
    const snapshot=contextSnapshot(story,author,raw);
    return [
      '手機主人：'+owner,
      '主要聯絡人：'+contact,
      '聯絡人 ID：'+JSON.stringify(config.contacts.map(({id,name})=>({id,name}))),
      '聊天室 ID：'+JSON.stringify(config.threads.map(({id,name,participants})=>({id,name,participants}))),
      '照片 ID：'+JSON.stringify(config.photos.map(({id,title})=>({id,title}))),
      '筆記 ID：'+JSON.stringify(config.notes.map(({id,title})=>({id,title}))),
      ...(config.interactions || raw?.interactions ? ['手機機關進度：'+JSON.stringify(Interactions?.progress(raw,story?.phoneInteractions))] : []),
      '故事手機時間：'+config.storyTime+' '+config.storyDate,
      snapshot,
      '手機主人未指定時，不得推定是玩家或任何特定 NPC。',
      '這是可見資訊範圍，不代表玩家能讀取其他 NPC 私密內容。'
    ].filter(Boolean).join('\n');
  };
  const write = (state, settings) => {
    if (!object(state)) return false;
    const value=read(settings);
    if (!value) return false;
    state.phoneSurface=value; // Only current story, no author-card mutations.
    return true;
  };
  return Object.freeze({empty,read,resolve,contextSnapshot,ownerDescription,write});
});

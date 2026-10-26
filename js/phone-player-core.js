/* Per-story player phone surface preferences. No storage, DOM or network. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./phone-ui-core.js') : root?.BAOPhoneUICore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOPhonePlayerCore = api;
})(typeof window !== 'undefined' ? window : null, function(PhoneCore) {
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
        for(const key of ['wallpaper','events','calls','chat','tweets','apps','locale','storyTime','storyDate','contacts','threads','photos','notes']){
          if(has(value.data,key)) data[key]=normalized[key];
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
  const ownerDescription = (story,author,display) => {
    const config=display || resolve(author,story);
    if (!config) return '';
    const owner=config.userName || '未指定';
    const contact=config.contactName || '未指定';
    return [
      '手機主人：'+owner,
      '主要聯絡人：'+contact,
      '聯絡人 ID：'+JSON.stringify(config.contacts.map(({id,name})=>({id,name}))),
      '聊天室 ID：'+JSON.stringify(config.threads.map(({id,name,participants})=>({id,name,participants}))),
      '照片 ID：'+JSON.stringify(config.photos.map(({id,title})=>({id,title}))),
      '筆記 ID：'+JSON.stringify(config.notes.map(({id,title})=>({id,title}))),
      '故事手機時間：'+config.storyTime+' '+config.storyDate,
      '手機主人未指定時，不得推定是玩家或任何特定 NPC。',
      '這是可見資訊範圍，不代表玩家能讀取其他 NPC 私密內容。'
    ].join('\n');
  };
  const write = (state, settings) => {
    if (!object(state)) return false;
    const value=read(settings);
    if (!value) return false;
    state.phoneSurface=value; // Only current story, no author-card mutations.
    return true;
  };
  return Object.freeze({empty,read,resolve,ownerDescription,write});
});

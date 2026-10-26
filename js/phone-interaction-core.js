/* Deterministic, story-owned phone puzzles. No DOM, storage, scripts or network. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOPhoneInteractionCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const apps = ['kakao','photos','notes'];
  const fields = {kakao:'threads',photos:'photos',notes:'notes'};
  const list = (value,max) => Array.isArray(value) ? value.slice(0,max) : [];
  const text = (value,max) => String(value ?? '').slice(0,max);
  const target = value => object(value) && apps.includes(value.app) && typeof value.id === 'string' && value.id.trim()
    ? {app:value.app,id:value.id.trim().slice(0,80)} : null;
  const key = value => value.app+':'+value.id;
  const unique = values => [...new Set(values)];
  const condition = value => object(value) && ['read','unlock'].includes(value.action) && target(value.target)
    ? {action:value.action,target:target(value.target)} : null;
  function normalize(value,phone=null) {
    if(value == null)return null;
    if (!object(value) || value.version !== 1) return {version:1,locks:[],events:[],invalid:true};
    const invalid=value.invalid===true || (phone && validate({...phone,interactions:value}).length>0);
    const locks = list(value.locks,80).filter(object).map(item => ({
      target:target(item.target), code:typeof item.code === 'string' ? item.code.slice(0,128) : '',
      hidden:item.hidden === true, hint:text(item.hint,300)
    })).filter(item=>item.target);
    const events = list(value.events,40).filter(object).map(item=>({
      id:text(item.id,80).trim(),when:condition(item.when),
      requires:list(item.requires,12).map(condition).filter(Boolean),
      unlock:list(item.unlock,12).map(target).filter(Boolean),notification:text(item.notification,300)
    })).filter(item=>item.id && item.when);
    return {version:1,locks,events,...(invalid?{invalid:true}:{})};
  }
  function validate(phone) {
    const raw=phone?.interactions;
    if (raw == null) return [];
    const errors=[];
    const issue = message => { if(errors.length<20)errors.push(message); };
    const only = (value,keys,path) => {
      if(!object(value)){issue(path+' 必須是物件');return false;}
      if(Object.keys(value).some(k=>!keys.includes(k)))issue(path+' 包含不支援的欄位');
      return true;
    };
    if(!only(raw,['version','locks','events'],'interactions'))return errors;
    if(raw.version!==1)issue('interactions.version 必須是 1');
    const arrays = (value,max,path) => {
      if(value===undefined)return [];
      if(!Array.isArray(value)){issue(path+' 必須是陣列');return [];}
      if(value.length>max)issue(path+' 超過 '+max+' 項');
      return value.slice(0,max);
    };
    const validText = (value,max,path,required=false) => {
      if(value===undefined && !required)return;
      if(typeof value!=='string' || value.length>max || (required && !value.trim()))issue(path+' 文字無效或過長');
    };
    const exists = value => target(value) && list(phone?.[fields[value.app]],150).some(item=>item?.id===value.id);
    const checkTarget = (value,path) => {
      if(!only(value,['app','id'],path))return false;
      validText(value.id,80,path+'.id',true);
      if(!apps.includes(value.app) || !exists(value)){issue(path+' 找不到對應的手機內容');return false;}
      return true;
    };
    const locks=arrays(raw.locks,80,'locks'),locked=new Set();
    locks.forEach((item,i)=>{
      const path='locks['+i+']';
      if(!only(item,['target','code','hidden','hint'],path))return;
      if(checkTarget(item.target,path+'.target')){
        const id=key(item.target);if(locked.has(id))issue(path+' 鎖定目標重複');locked.add(id);
      }
      validText(item.code,128,path+'.code');validText(item.hint,300,path+'.hint');
      if(item.hidden!==undefined && typeof item.hidden!=='boolean')issue(path+'.hidden 必須是布林值');
    });
    const checkCondition = (value,path) => {
      if(!only(value,['action','target'],path))return;
      if(!['read','unlock'].includes(value.action))issue(path+'.action 只支援 read 或 unlock');
      if(checkTarget(value.target,path+'.target') && value.action==='unlock' && !locked.has(key(value.target)))issue(path+' 解鎖條件必須指向已設定的鎖');
    };
    const ids=new Set();
    arrays(raw.events,40,'events').forEach((event,i)=>{
      const path='events['+i+']';
      if(!only(event,['id','when','requires','unlock','notification'],path))return;
      validText(event.id,80,path+'.id',true);
      if(ids.has(event.id))issue(path+' 事件 id 重複');ids.add(event.id);
      checkCondition(event.when,path+'.when');
      arrays(event.requires,12,path+'.requires').forEach((item,j)=>checkCondition(item,path+'.requires['+j+']'));
      const unlock=arrays(event.unlock,12,path+'.unlock');
      unlock.forEach((item,j)=>{
        if(checkTarget(item,path+'.unlock['+j+']') && !locked.has(key(item)))issue(path+' 解鎖效果必須指向已設定的鎖');
      });
      validText(event.notification,300,path+'.notification');
      if(!unlock.length && !(typeof event.notification==='string' && event.notification.trim()))issue(path+' 至少需要解鎖效果或通知');
    });
    return errors;
  }
  function progress(phone,value) {
    const config=normalize(phone?.interactions,phone);
    const known=new Set(apps.flatMap(app=>list(phone?.[fields[app]],150).filter(object).map(item=>key({app,id:item.id}))));
    const locks=new Set((config?.locks||[]).map(item=>key(item.target)));
    const ids=new Set((config?.events||[]).map(item=>item.id));
    const source=object(value) && value.version===1 ? value : {};
    return {version:1,
      read:unique(list(source.read,190).filter(id=>known.has(id))),
      unlocked:unique(list(source.unlocked,80).filter(id=>locks.has(id))),
      fired:unique(list(source.fired,40).filter(id=>ids.has(id)))
    };
  }
  function access(phone,state,value) {
    const t=target(value);
    if(!t || !list(phone?.[fields[t.app]],150).some(item=>item?.id===t.id))return {exists:false,hidden:true,locked:true,hint:'',password:false};
    const config=normalize(phone.interactions,phone);
    if(config?.invalid)return {exists:true,hidden:true,locked:true,hint:'手機機關設定無效',password:false};
    const lock=config?.locks.find(item=>key(item.target)===key(t));
    const locked=!!lock && !progress(phone,state).unlocked.includes(key(t));
    return {exists:true,hidden:locked && lock.hidden,locked,hint:locked?lock.hint:'',password:locked && !!lock.code};
  }
  function visibleItems(phone,state,app) {
    return list(phone?.[fields[app]],150).filter(item=>!access(phone,state,{app,id:item.id}).hidden);
  }
  function forPrompt(phone,state) {
    if(!phone)return phone;
    const result={...phone,interactions:null};
    for(const app of apps)result[fields[app]]=list(phone[fields[app]],150).filter(item=>!access(phone,state,{app,id:item.id}).locked);
    if(phone.interactions){
      const identities=thread=>[...(thread.participants||[]),...(thread.messages||[]).map(item=>item.senderId).filter(Boolean)];
      const visible=new Set(result.threads.flatMap(identities));
      const locked=new Set(list(phone.threads,30).filter(thread=>access(phone,state,{app:'kakao',id:thread.id}).locked).flatMap(identities));
      result.contacts=list(phone.contacts,30).filter(contact=>!locked.has(contact.id) || visible.has(contact.id) || contact.name===phone.contactName);
    }
    return result;
  }
  function open(phone,state,value,password) {
    const next=progress(phone,state),a=access(phone,state,value),t=target(value);
    const reject=error=>({ok:false,error,changed:false,progress:next,notifications:[]});
    if(validate(phone).length)return reject('手機機關設定無效，請檢查內容引用。');
    if(!a.exists || a.hidden)return reject('目前無法開啟這份內容。');
    const config=normalize(phone.interactions,phone);
    if(a.locked){
      const lock=config.locks.find(item=>key(item.target)===key(t));
      if(!lock.code)return reject('需要先找到其他線索才能開啟。');
      if(typeof password!=='string' || password!==lock.code)return reject('密碼不正確。');
      next.unlocked.push(key(t));
    }
    next.read=unique([...next.read,key(t)]);
    const satisfied = rule => next[rule.action==='read'?'read':'unlocked'].includes(key(rule.target));
    const notifications=[];
    // Fixed-point resolution supports cross-App chains. Each event can fire once;
    // even circular rules terminate after at most 40 event executions.
    let changed=true;
    while(changed){
      changed=false;
      for(const event of config?.events||[]){
        if(next.fired.includes(event.id) || !satisfied(event.when) || !event.requires.every(satisfied))continue;
        next.fired.push(event.id);
        next.unlocked=unique([...next.unlocked,...event.unlock.map(key)]);
        if(event.notification)notifications.push(event.notification);
        changed=true;
      }
    }
    return {ok:true,error:'',changed:JSON.stringify(next)!==JSON.stringify(progress(phone,state)),progress:next,notifications};
  }
  return Object.freeze({normalize,validate,progress,access,visibleItems,forPrompt,open});
});

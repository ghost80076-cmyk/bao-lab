/* Per-story player phone options. Available in existing and new stories; never edits cards. */
(() => {
  'use strict';
  if (window.BAOPhonePlayerSettings || !window.BAOPhonePlayerCore ||
      !window.BAOPhoneUICore || typeof App === 'undefined') return;
  const Core=window.BAOPhonePlayerCore;
  const $=(tag,cls,text) => {
    const node=document.createElement(tag);
    if(cls) node.className=cls;
    if(text!==undefined) node.textContent=String(text);
    return node;
  };
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };
  const active = () => !!window.GameState?.current &&
    !!App.activeCharacter && !!document.getElementById('chat-view')?.classList.contains('active');
  let modal=null;
  const close = () => {modal?.close?.();modal?.remove();modal=null;};
  function refresh() {
    const btn=document.getElementById('bao-phone-player-entry');
    if(!active()) {btn?.remove();close();return;}
    const aside=document.querySelector('#chat-view .chat-layout > aside');
    const target=aside?.querySelector('[data-chat-tool-body="scene"]') ||
      document.querySelector('#chat-view .chat-main .chat-topline');
    if(!target) return;
    if(!btn) {
      const button=$('button','secondary bao-phone-player-entry','📱 手機設定');
      button.id='bao-phone-player-entry';button.type='button';
      button.dataset.searchKeywords='手機 互動 UI 畫面 開啟 關閉 電話 社群';
      button.addEventListener('click',open);
      target.append(button);
    } else if(btn.parentElement!==target) target.append(btn);
  }
  function open(){
    if(!active())return;
    if(App.__requestPending){window.BAOFeedback?.notify?.('目前正在產生故事，請完成本輪再修改手機設定。','error');return;}
    close();
    const state=GameState.current;
    const character=App.activeCharacter;
    const previous=Core.read(state.phoneSurface);
    const authored=window.BAOPhoneUICore.normalize(character?.phone_ui);
    const effective=Core.resolve(character?.phone_ui,state);
    const current=effective||authored||window.BAOPhoneUICore.defaultConfig();
    modal=$('dialog','bao-phone-settings-dialog');
    modal.setAttribute('aria-label','故事手機介面設定');
    const heading=$('div','bp-settings-heading');
    const title=$('h2','', '📱 手機互動介面');
    const x=$('button','bp-settings-close','✕');x.type='button';x.setAttribute('aria-label','關閉設定');
    x.addEventListener('click',close);
    heading.append(title,x);
    const description=$('p','bp-settings-intro','這是目前故事專屬的手機呈現方式。作者的角色卡、其他故事、原本的閱讀模式及正則都不會被改動。');
    const form=$('form','bp-settings-form');
    form.addEventListener('submit',event => {event.preventDefault();save(event,state,character);});
    const on=field('啟用這個故事的手機介面','checkbox','enabled',previous?.enabled??Boolean(authored));
    const owner=field('手機主人／顯示名稱','text','userName',previous?.userName??current.userName,'例：我、林曼、未知主人');
    const contact=field('主要聯絡人','text','contactName',previous?.contactName??current.contactName,'例：閨蜜、前女友、未知聯絡人');
    const handle=field('X 帳號（選填）','text','twitterHandle',previous?.twitterHandle??current.twitterHandle,'例：@secret');
    const advanced=$('details','bp-settings-advanced');
    const summary=$('summary','', '進階：手機自訂資料 JSON（選填）');
    const note=$('p','', '可設定壁紙、聊天紀錄、社群貼文、通話、歌單等，不會執行 HTML 或 JavaScript。最大 20,000 字元。');
    const input=$('textarea');input.name='data';input.rows=5;input.maxLength=20000;input.spellcheck=false;
    input.placeholder='{"chat":[{"text":"早安","from":"them"}],"tweets":["下雨了"]}';
    if(previous?.data) input.value=JSON.stringify(previous.data,null,2);
    advanced.append(summary,note,input);
    const msg=$('p','bp-settings-error');msg.dataset.phoneSettingsError='';msg.setAttribute('role','status');
    const actions=$('div','bp-settings-actions');
    const reset=$('button','secondary','恢復作品預設');reset.type='button';
    reset.addEventListener('click',()=>{
      if(!canSave(state,character,msg))return;
      const old=state.phoneSurface;
      delete state.phoneSurface;
      if(App.saveStory(false)===false) {
        state.phoneSurface=old;msg.textContent='故事儲存失敗，沒有變更手機設定。';return;
      }
      close();window.BAOPhoneUI?.refresh?.();
    });
    const saveBtn=$('button','primary','儲存手機設定');saveBtn.type='submit';
    actions.append(reset,saveBtn);
    form.append(on,owner,contact,handle,advanced,msg,actions);
    modal.append(heading,description,form);
    modal.addEventListener('close',()=>{modal?.remove();modal=null;});
    document.body.append(modal);modal.showModal();
  }
  function field(title,type,name,value,placeholder='') {
    const label=$('label','bp-settings-field');
    const text=$('span','',title);const input=$('input');
    input.type=type;input.name=name;
    if(type==='checkbox') input.checked=Boolean(value);
    else{input.value=String(value||'');input.maxLength=80;input.placeholder=placeholder;}
    label.append(input,text);
    if(type!=='checkbox'){label.replaceChildren(text,input);}
    return label;
  }
  function canSave(state,character,status){
    if(state!==GameState.current || character!==App.activeCharacter){
      status.textContent='故事已經切換，請重新開啟設定。';return false;
    }
    if(App.__requestPending){status.textContent='請在本輪故事回覆完成後再修改設定。';return false;}
    return true;
  }
  function save(event,state,character) {
    const form=event.currentTarget,status=form.querySelector('[data-phone-settings-error]');
    status.textContent='';
    if(!canSave(state,character,status))return;
    let data=null;
    const raw=form.elements.namedItem('data').value.trim();
    if(raw){
      try{data=JSON.parse(raw);}
      catch(_){status.textContent='自訂手機資料不是有效 JSON，請檢查格式。';return;}
      if(!data || typeof data!=='object' || Array.isArray(data)){
        status.textContent='自訂手機資料必須是 JSON 物件。';return;
      }
    }
    const snapshot=Object.prototype.hasOwnProperty.call(state,'phoneSurface')?clone(state.phoneSurface):undefined;
    const next={
      version:1,enabled:form.elements.namedItem('enabled').checked,
      userName:form.elements.namedItem('userName').value,
      contactName:form.elements.namedItem('contactName').value,
      twitterHandle:form.elements.namedItem('twitterHandle').value,data
    };
    if(!Core.write(state,next)){status.textContent='手機設定無效，未儲存。';return;}
    if(App.saveStory(false)===false){
      if(snapshot===undefined) delete state.phoneSurface;
      else state.phoneSurface=snapshot;
      status.textContent='故事儲存失敗，沒有變更手機設定。';
      return;
    }
    close();window.BAOPhoneUI?.refresh?.();
    window.BAOFeedback?.notify?.('已儲存到目前故事。');
  }
  const shell = function(next,...args){
    const result=next(...args);window.setTimeout(refresh,0);return result;
  };
  if(typeof App.wrapRenderChatShell==='function'){
    App.wrapRenderChatShell('phone-player:settings',shell);
  }
  if(typeof App.wrapShowView==='function'){
    App.wrapShowView('phone-player:settings',function(next,...args){
      const result=next(...args);if(args[0]!=='chat')close();window.setTimeout(refresh,0);return result;
    });
  }
  window.BAOPhonePlayerSettings=Object.freeze({open,close,refresh});
})();
